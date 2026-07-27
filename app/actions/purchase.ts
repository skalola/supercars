"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function getAuthenticatedUser() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: Please sign in.");
  }
  return userId;
}

export async function createPurchasePlaceholder(listingId: string, amount: number) {
  const userId = await getAuthenticatedUser();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId }
  });

  if (!listing) {
    throw new Error("Listing not found.");
  }

  const purchase = await prisma.purchase.create({
    data: {
      listingId,
      buyerId: userId,
      amount,
      status: "PENDING"
    }
  });

  return { id: purchase.id };
}

export async function createInsuranceRequestPlaceholder(
  purchaseId: string,
  status: "NOT_STARTED" | "REQUESTED" | "QUOTE_STARTED" | "COMPLETED"
) {
  const userId = await getAuthenticatedUser();

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { listing: true }
  });

  if (!purchase) {
    throw new Error("Purchase order not found.");
  }

  const vehicleId = purchase.listing.vehicleId;
  if (!vehicleId) {
    throw new Error("Listing has no associated vehicle passport.");
  }

  const request = await prisma.insuranceRequest.upsert({
    where: { purchaseId },
    update: { status },
    create: {
      purchaseId,
      userId,
      vehicleId,
      status
    }
  });

  return { id: request.id, status: request.status };
}

export async function createDeliveryRequestPlaceholder(
  purchaseId: string,
  address: { streetAddress: string; city: string; state: string; postalCode: string },
  transportMethod: string,
  deliveryDate: string
) {
  const userId = await getAuthenticatedUser();

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { listing: true }
  });

  if (!purchase) {
    throw new Error("Purchase order not found.");
  }

  const vehicleId = purchase.listing.vehicleId;
  if (!vehicleId) {
    throw new Error("Listing has no associated vehicle passport.");
  }

  const request = await prisma.deliveryRequest.upsert({
    where: { purchaseId },
    update: {
      street: address.streetAddress,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      transportMethod,
      deliveryDate,
      status: "REQUESTED"
    },
    create: {
      purchaseId,
      userId,
      vehicleId,
      status: "REQUESTED",
      street: address.streetAddress,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      transportMethod,
      deliveryDate
    }
  });

  await prisma.purchase.update({
    where: { id: purchaseId },
    data: { status: "COMPLETED" }
  });

  return { id: request.id, status: request.status };
}
