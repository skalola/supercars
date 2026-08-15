"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { vehicleListingInputSchema } from "@/lib/validation/community-inputs";
import { vinClaimSchema } from "@/lib/validation/transaction-inputs";

function safeRevalidatePath(vin: string) {
  try {
    revalidatePath(`/vehicle/${vin}`);
    revalidatePath(`/vehicle/${vin}/edit`);
  } catch {
    // Ignore in non-HTTP-request scope
  }
}

async function verifyOwnership(vin: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: Please sign in.");
  }

  const validatedVin = vinClaimSchema.parse(vin);
  const vehicle = await prisma.vehicle.findUnique({
    where: { vin: validatedVin },
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
  const listingInput = vehicleListingInputSchema.parse({ vin, askingPrice });
  const { userId, vehicle } = await verifyOwnership(listingInput.vin);

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
      price: listingInput.askingPrice,
      askingPrice: listingInput.askingPrice,
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
  const { vehicle } = await verifyOwnership(vinClaimSchema.parse(vin));

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
