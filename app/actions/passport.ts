"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function safeRevalidatePath(vin: string) {
  try {
    revalidatePath(`/vehicle/${vin}`);
    revalidatePath(`/vehicle/${vin}/edit`);
  } catch {
    // Ignore in non-HTTP-request scope
  }
}

async function verifyOwnership(vin: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: Please sign in.");
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
  });

  if (!vehicle) {
    throw new Error("Vehicle not found.");
  }

  if (vehicle.ownerId !== userId || vehicle.status !== "CLAIMED") {
    throw new Error("Unauthorized: You do not own this claimed vehicle.");
  }

  return { userId, vehicleId: vehicle.id };
}

export async function updateVehicleProfile(
  vin: string,
  data: {
    exteriorColor?: string;
    interiorColor?: string;
    currentMileage?: number | null;
    ownerNotes?: string;
  }
) {
  const { vehicleId } = await verifyOwnership(vin);

  await prisma.vehicleProfile.upsert({
    where: { vehicleId },
    update: {
      exteriorColor: data.exteriorColor || null,
      interiorColor: data.interiorColor || null,
      currentMileage: data.currentMileage || null,
      ownerNotes: data.ownerNotes || null,
    },
    create: {
      vehicleId,
      exteriorColor: data.exteriorColor || null,
      interiorColor: data.interiorColor || null,
      currentMileage: data.currentMileage || null,
      ownerNotes: data.ownerNotes || null,
    },
  });

  safeRevalidatePath(vin);
}

export async function addVehicleModification(
  vin: string,
  data: {
    name: string;
    brand?: string;
    description?: string;
    installedDate?: string;
  }
) {
  const { vehicleId } = await verifyOwnership(vin);

  if (!data.name || data.name.trim() === "") {
    throw new Error("Modification name is required.");
  }

  await prisma.vehicleModification.create({
    data: {
      vehicleId,
      name: data.name,
      brand: data.brand || null,
      description: data.description || null,
      installedDate: data.installedDate || null,
    },
  });

  safeRevalidatePath(vin);
}

export async function addServiceRecord(
  vin: string,
  data: {
    serviceDate: string;
    mileage?: number | null;
    shopName?: string;
    description?: string;
    cost?: number | null;
  }
) {
  const { vehicleId } = await verifyOwnership(vin);

  if (!data.serviceDate) {
    throw new Error("Service date is required.");
  }

  await prisma.serviceRecord.create({
    data: {
      vehicleId,
      serviceDate: new Date(data.serviceDate),
      mileage: data.mileage || null,
      shopName: data.shopName || null,
      description: data.description || null,
      cost: data.cost || null,
    },
  });

  safeRevalidatePath(vin);
}

export async function completeMaintenanceItem(
  vin: string,
  data: {
    serviceName: string;
    serviceDate: string;
    mileage: number;
    shopName?: string;
    description?: string;
    cost?: number | null;
  }
) {
  const { vehicleId } = await verifyOwnership(vin);

  if (!data.serviceDate) {
    throw new Error("Service date is required.");
  }
  if (!data.mileage) {
    throw new Error("Completed mileage is required.");
  }

  const dbDescription = `[${data.serviceName}] ${data.description || ""}`.trim();

  await prisma.serviceRecord.create({
    data: {
      vehicleId,
      serviceDate: new Date(data.serviceDate),
      mileage: data.mileage,
      shopName: data.shopName || null,
      description: dbDescription,
      cost: data.cost || null,
    },
  });

  const profile = await prisma.vehicleProfile.findUnique({
    where: { vehicleId },
  });

  if (!profile || profile.currentMileage === null || data.mileage > profile.currentMileage) {
    await prisma.vehicleProfile.upsert({
      where: { vehicleId },
      update: { currentMileage: data.mileage },
      create: { vehicleId, currentMileage: data.mileage },
    });
  }

  safeRevalidatePath(vin);
}

export async function addVehicleAward(
  vin: string,
  data: {
    title: string;
    eventName?: string;
    awardDate?: string;
    description?: string;
  }
) {
  const { vehicleId } = await verifyOwnership(vin);

  if (!data.title || data.title.trim() === "") {
    throw new Error("Award title is required.");
  }

  await prisma.vehicleAward.create({
    data: {
      vehicleId,
      title: data.title,
      eventName: data.eventName || null,
      awardDate: data.awardDate ? new Date(data.awardDate) : null,
      description: data.description || null,
    },
  });

  safeRevalidatePath(vin);
}
