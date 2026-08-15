"use server";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { enforceActionRateLimit } from "@/lib/security/action-rate-limit";
import { vinClaimSchema } from "@/lib/validation/transaction-inputs";
import { garageItemIdSchema } from "@/lib/validation/community-inputs";

export async function claimVehicle(
  modelId: string,
  vin: string,
) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  const parsedVin = vinClaimSchema.safeParse(vin);
  if (!parsedVin.success) throw new Error("Enter a valid 17-character VIN.");
  vin = parsedVin.data;
  modelId = garageItemIdSchema.parse(modelId);
  await enforceActionRateLimit({
    actorId: userId,
    action: "claim_vehicle",
    bucketKey: vin,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

  try {
    const [decodedData, selectedModel] = await Promise.all([
      decodeVin(vin),
      prisma.model.findUnique({
        where: { id: modelId },
        select: { id: true, name: true, make: { select: { name: true } } },
      }),
    ]);
    if (!decodedData?.Make || !decodedData.Model || !selectedModel) {
      throw new Error("Could not verify this VIN against the selected model.");
    }

    const makeMatches = vehicleNamesMatch(decodedData.Make, selectedModel.make.name);
    const modelMatches = vehicleNamesMatch(decodedData.Model, selectedModel.name);
    if (!makeMatches || !modelMatches) {
      throw new Error("This VIN does not match the selected vehicle.");
    }

    const existingVehicle = await prisma.vehicle.findUnique({
      where: { vin },
      select: {
        year: true,
      },
    });
    await upsertClaimedVehicle({
      userId,
      modelId,
      vin,
      year: existingVehicle?.year ?? (Number(decodedData.ModelYear) || new Date().getFullYear()),
      decodedData,
    });
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

  const parsedVin = vinClaimSchema.safeParse(vinInput);
  if (!parsedVin.success) {
    return { ok: false, reason: "invalid_vin", message: "Enter a valid 17-character VIN." };
  }
  const vin = parsedVin.data;
  await enforceActionRateLimit({
    actorId: session.user.id,
    action: "claim_vehicle",
    bucketKey: vin,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });

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
    select: {
      models: {
        select: {
          id: true,
          name: true,
        },
      },
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

function vehicleNamesMatch(left: string, right: string) {
  const normalizedLeft = normalizeVehicleText(left);
  const normalizedRight = normalizeVehicleText(right);
  return normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
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

  const updated = await prisma.vehicle.updateMany({
    where: {
      vin,
      OR: [{ ownerId: null }, { ownerId: userId }],
    },
    data: vehicleData,
  });
  if (updated.count > 0) return;

  try {
    await prisma.vehicle.create({ data: { vin, ...vehicleData } });
    return;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const retried = await prisma.vehicle.updateMany({
    where: {
      vin,
      OR: [{ ownerId: null }, { ownerId: userId }],
    },
    data: vehicleData,
  });
  if (retried.count === 0) {
    throw new Error("This vehicle is already claimed by another owner.");
  }
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
