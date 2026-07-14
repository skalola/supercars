"use server";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

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

