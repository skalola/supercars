"use server";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export async function claimVehicle(
  modelId: string, 
  vin: string, 
  year: number, 
  decodedData: Record<string, string | null | undefined>
) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  try {
    const existingVehicle = await prisma.vehicle.findUnique({
      where: { vin },
    });

    const vehicleData = {
      ownerId: userId,
      status: "CLAIMED",
      modelId,
      year,
      color: decodedData.color,
      mileage: null, // Not provided by NHTSA API
      transmission: decodedData.TransmissionStyle,
      drivetrain: decodedData.DriveType,
      engine: decodedData.EngineModel,
      bodyStyle: decodedData.BodyClass,
      fuelType: decodedData.FuelTypePrimary,
      manufacturer: decodedData.Manufacturer,
      plantCountry: decodedData.PlantCountry,
      // New comprehensive fields
      trim: decodedData.Trim,
      series: decodedData.Series,
      vehicleType: decodedData.VehicleType,
      doors: decodedData.Doors,
      engineConfiguration: decodedData.EngineConfiguration,
      engineCylinders: decodedData.EngineCylinders,
      displacement: decodedData.DisplacementL,
      turbo: decodedData.Turbo,
      transmissionSpeeds: decodedData.TransmissionSpeeds,
      plantCity: decodedData.PlantCity,
      gvwr: decodedData.GVWR,
      brakeSystem: decodedData.BrakeSystemType,
      electrificationLevel: decodedData.ElectrificationLevel,
      // Additional fields requested
      destinationMarket: decodedData.DestinationMarket,
      engineHP: decodedData.EngineHP,
      engineKW: decodedData.EngineKW,
      engineManufacturer: decodedData.EngineManufacturer,
      plantState: decodedData.PlantState,
      abs: decodedData.ABS,
      esc: decodedData.ESC,
      tpms: decodedData.TPMS,
      rearVisibilitySystem: decodedData.RearVisibilitySystem,
      parkAssist: decodedData.ParkAssist,
      adaptiveDrivingBeam: decodedData.AdaptiveDrivingBeam,
      airBagLocFront: decodedData.AirBagLocFront,
      airBagLocKnee: decodedData.AirBagLocKnee,
      airBagLocSide: decodedData.AirBagLocSide,
      pretensioner: decodedData.Pretensioner,
      seatBeltsAll: decodedData.SeatBeltsAll,
    };

    if (existingVehicle) {
      await prisma.vehicle.update({
        where: { id: existingVehicle.id },
        data: vehicleData,
      });
    } else {
      await prisma.vehicle.create({
        data: {
          vin,
          ...vehicleData,
        },
      });
    }
  } catch (e) {
    console.error("Claim error:", e);
    throw new Error("Could not process vehicle claim.");
  }

  redirect("/garage");
}

export async function claimVehicleByVin(vinInput: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthenticated", message: "Sign in to claim a vehicle." };
  }

  const vin = vinInput.trim().toUpperCase();
  if (!VIN_RE.test(vin)) {
    return { ok: false, reason: "invalid_vin", message: "Enter a valid 17-character VIN." };
  }

  const decodedData = await decodeVin(vin);
  if (!decodedData?.Make || !decodedData?.Model) {
    return { ok: false, reason: "decode_failed", message: "We could not decode this VIN." };
  }

  const existingVehicle = await prisma.vehicle.findUnique({
    where: { vin },
    select: {
      modelId: true,
      year: true,
    },
  });
  const model = existingVehicle ? null : await findCatalogModel(decodedData.Make, decodedData.Model);
  const modelId = existingVehicle?.modelId ?? model?.id;

  if (!modelId) {
    return {
      ok: false,
      reason: "model_not_found",
      message: `We decoded this as ${decodedData.Make} ${decodedData.Model}, but that model is not in the catalog yet.`,
    };
  }

  await upsertClaimedVehicle({
    userId: session.user.id as string,
    modelId,
    vin,
    year: existingVehicle?.year ?? (Number(decodedData.ModelYear) || new Date().getFullYear()),
    decodedData,
  });

  revalidatePath("/garage");
  return { ok: true, href: "/garage" };
}

async function decodeVin(vin: string): Promise<Record<string, string | null | undefined> | null> {
  const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.Results?.[0] ?? null;
}

async function findCatalogModel(makeName: string, decodedModelName: string) {
  const make = await prisma.make.findFirst({
    where: {
      name: { equals: makeName, mode: "insensitive" },
    },
    include: {
      models: true,
    },
  });
  if (!make) return null;

  const decoded = normalizeVehicleText(decodedModelName);
  return (
    make.models.find((model) => normalizeVehicleText(model.name) === decoded) ||
    make.models.find((model) => {
      const catalog = normalizeVehicleText(model.name);
      return decoded.includes(catalog) || catalog.includes(decoded);
    }) ||
    null
  );
}

function normalizeVehicleText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(spider|spyder|coupe|convertible|roadster|sedan|awd|rwd|fwd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function upsertClaimedVehicle({
  userId,
  modelId,
  vin,
  year,
  decodedData,
}: {
  userId: string;
  modelId: string;
  vin: string;
  year: number;
  decodedData: Record<string, string | null | undefined>;
}) {
  const vehicleData = {
    ownerId: userId,
    status: "CLAIMED",
    modelId,
    year,
    color: decodedData.color,
    mileage: null,
    transmission: decodedData.TransmissionStyle,
    drivetrain: decodedData.DriveType,
    engine: decodedData.EngineModel,
    bodyStyle: decodedData.BodyClass,
    fuelType: decodedData.FuelTypePrimary,
    manufacturer: decodedData.Manufacturer,
    plantCountry: decodedData.PlantCountry,
    trim: decodedData.Trim,
    series: decodedData.Series,
    vehicleType: decodedData.VehicleType,
    doors: decodedData.Doors,
    engineConfiguration: decodedData.EngineConfiguration,
    engineCylinders: decodedData.EngineCylinders,
    displacement: decodedData.DisplacementL,
    turbo: decodedData.Turbo,
    transmissionSpeeds: decodedData.TransmissionSpeeds,
    plantCity: decodedData.PlantCity,
    gvwr: decodedData.GVWR,
    brakeSystem: decodedData.BrakeSystemType,
    electrificationLevel: decodedData.ElectrificationLevel,
    destinationMarket: decodedData.DestinationMarket,
    engineHP: decodedData.EngineHP,
    engineKW: decodedData.EngineKW,
    engineManufacturer: decodedData.EngineManufacturer,
    plantState: decodedData.PlantState,
    abs: decodedData.ABS,
    esc: decodedData.ESC,
    tpms: decodedData.TPMS,
    rearVisibilitySystem: decodedData.RearVisibilitySystem,
    parkAssist: decodedData.ParkAssist,
    adaptiveDrivingBeam: decodedData.AdaptiveDrivingBeam,
    airBagLocFront: decodedData.AirBagLocFront,
    airBagLocKnee: decodedData.AirBagLocKnee,
    airBagLocSide: decodedData.AirBagLocSide,
    pretensioner: decodedData.Pretensioner,
    seatBeltsAll: decodedData.SeatBeltsAll,
  };

  await prisma.vehicle.upsert({
    where: { vin },
    update: vehicleData,
    create: {
      vin,
      ...vehicleData,
    },
  });
}
