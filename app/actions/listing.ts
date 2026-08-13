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
    select: {
      id: true,
      ownerId: true,
      status: true,
      modelId: true,
      year: true,
      mileage: true,
      color: true,
      profile: {
        select: {
          currentMileage: true,
          exteriorColor: true,
        },
      },
    },
  });

  if (!vehicle) {
    throw new Error("Vehicle not found.");
  }

  if (vehicle.ownerId !== userId || vehicle.status !== "CLAIMED") {
    throw new Error("Unauthorized: You do not own this claimed vehicle.");
  }

  return { userId, vehicle };
}

export async function listVehicleForSale(vin: string, askingPrice: number) {
  const { userId, vehicle } = await verifyOwnership(vin);

  if (!askingPrice || askingPrice <= 0) {
    throw new Error("Please enter a valid asking price.");
  }

  // Deactivate any existing active listings for this vehicle (status: REMOVED)
  await prisma.listing.updateMany({
    where: {
      vehicleId: vehicle.id,
      status: "ACTIVE",
    },
    data: {
      status: "REMOVED",
    },
  });

  // Create new active listing
  await prisma.listing.create({
    data: {
      modelId: vehicle.modelId,
      year: vehicle.year,
      price: askingPrice,
      askingPrice: askingPrice,
      mileage: vehicle.profile?.currentMileage || vehicle.mileage || null,
      color: vehicle.profile?.exteriorColor || vehicle.color || null,
      status: "ACTIVE",
      vehicleId: vehicle.id,
      sellerId: userId,
    },
  });

  safeRevalidatePath(vin);
}

export async function removeFromSale(vin: string) {
  const { vehicle } = await verifyOwnership(vin);

  // Deactivate active listings
  await prisma.listing.updateMany({
    where: {
      vehicleId: vehicle.id,
      status: "ACTIVE",
    },
    data: {
      status: "REMOVED",
    },
  });

  safeRevalidatePath(vin);
}
