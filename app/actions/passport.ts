"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isValidVin } from "@/lib/market-crawlers/vin-extractor";
import { createFulfillmentRequest } from "@/lib/fulfillment/service";
import { resolvePartnerContact } from "@/lib/fulfillment/partner-registry";
import {
  generateServiceBookingPackagePayload,
  dispatchServiceBookingEmail,
} from "@/lib/fulfillment/service-booking-package";
import { getServiceBookingFeeCents } from "@/lib/payments/payment-service";
import { isSupportedMake } from "@/lib/supported-makes";

function safeRevalidatePath(vin: string) {
  try {
    revalidatePath(`/vehicle/${vin}`);
    revalidatePath(`/vehicle/${vin}/edit`);
  } catch {
    // Ignore in non-HTTP-request scope
  }
}

function cleanNumber(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number.isFinite(value) ? value : null;
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
    categoryId?: string | null;
    hpGainOverride?: number | null;
    torqueGainOverride?: number | null;
  }
) {
  const { userId, vehicleId } = await verifyOwnership(vin);

  if (!data.name || data.name.trim() === "") {
    throw new Error("Modification name is required.");
  }

  await prisma.$transaction(async (tx) => {
    const modification = await tx.vehicleModification.create({
      data: {
        vehicleId,
        name: data.name.trim(),
        brand: data.brand || null,
        description: data.description || null,
        installedDate: data.installedDate || null,
      },
    });

    await tx.vehicleInstalledPart.create({
      data: {
        vehicleId,
        userId,
        legacyModificationId: modification.id,
        categoryId: data.categoryId || null,
        customName: data.name.trim(),
        customBrandName: data.brand || null,
        installedDate: data.installedDate || null,
        notes: data.description || null,
        hpGainOverride: cleanNumber(data.hpGainOverride),
        torqueGainOverride: cleanNumber(data.torqueGainOverride),
        verificationStatus: "OWNER_REPORTED",
      },
    });
  });

  safeRevalidatePath(vin);
}

export async function addVehicleInstalledPart(
  vin: string,
  data: {
    partId: string;
    installedDate?: string;
    notes?: string;
    hpGainOverride?: number | null;
    torqueGainOverride?: number | null;
  }
) {
  const { userId, vehicleId } = await verifyOwnership(vin);

  if (!data.partId) {
    throw new Error("Choose a catalog part.");
  }

  const part = await prisma.performancePart.findUnique({
    where: { id: data.partId },
    include: {
      brand: true,
      category: true,
    },
  });

  if (!part || part.status === "INACTIVE") {
    throw new Error("Catalog part is unavailable.");
  }

  const existingInstall = await prisma.vehicleInstalledPart.findFirst({
    where: {
      vehicleId,
      partId: part.id,
      installStatus: "INSTALLED",
    },
    select: { id: true },
  });

  if (existingInstall) {
    throw new Error("This part is already installed on the vehicle.");
  }

  await prisma.$transaction(async (tx) => {
    const modification = await tx.vehicleModification.create({
      data: {
        vehicleId,
        name: part.name,
        brand: part.brand.name,
        description: data.notes || part.description || part.category.name,
        installedDate: data.installedDate || null,
      },
    });

    await tx.vehicleInstalledPart.create({
      data: {
        vehicleId,
        userId,
        partId: part.id,
        legacyModificationId: modification.id,
        categoryId: part.categoryId,
        installedDate: data.installedDate || null,
        notes: data.notes || null,
        hpGainOverride: cleanNumber(data.hpGainOverride),
        torqueGainOverride: cleanNumber(data.torqueGainOverride),
        verificationStatus: "OWNER_REPORTED",
      },
    });
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

export interface CreateServiceBookingInput {
  vin: string;
  serviceName: string;
  shopName: string;
  preferredDate: string;
  preferredTime: string;
  notes?: string;
  customerPhone?: string;
  depositAmount?: number;
}

export async function createServiceBookingPackage(input: CreateServiceBookingInput) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: Please sign in to book service.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin: input.vin },
    include: {
      model: { include: { make: true } },
      profile: true,
      documents: true,
    },
  });

  if (!vehicle) {
    throw new Error("Vehicle passport not found.");
  }

  if (!isValidVin(vehicle.vin)) {
    throw new Error("Service booking packages require a valid VIN-backed supported supercar vehicle.");
  }

  const makeName = vehicle.model.make.name;
  if (!isSupportedMake(makeName)) {
    throw new Error("Service booking packages are only supported for supported supercar makes.");
  }

  if (!input.serviceName.trim() || !input.shopName.trim() || !input.preferredDate || !input.preferredTime) {
    throw new Error("Service name, shop, preferred date, and preferred time are required.");
  }

  // 1. Resolve Certified Service Shop Partner Contact
  const resolvedShop = await resolvePartnerContact({
    name: input.shopName,
    type: "SERVICE_SHOP",
  });

  const customerName = user?.name || user?.username || "Vehicle Owner";
  const customerEmail = user?.email;
  if (!customerEmail) {
    throw new Error("Customer email is required to create a service booking package.");
  }
  const depositAmount = getServiceBookingFeeCents() / 100;

  // 2. Construct Standardized Service Booking Scoped Payload
  const bookingPayload = generateServiceBookingPackagePayload({
    vin: vehicle.vin,
    year: vehicle.year,
    make: makeName,
    model: vehicle.model.name,
    currentMileage: vehicle.profile?.currentMileage || null,
    passportHealthScore: 100,
    serviceRequested: input.serviceName,
    preferredDate: input.preferredDate,
    preferredTime: input.preferredTime,
    customerName,
    customerEmail,
    customerPhone: input.customerPhone,
    shopName: resolvedShop?.name || input.shopName,
    shopEmail: resolvedShop?.email || null,
    notes: input.notes,
    attachedDocumentCount: vehicle.documents.length,
    depositAmount,
  });

  // 3. Create Fulfillment Request (SERVICE_BOOKING) for shop review.
  // Payment is requested only after the shop accepts the appointment.
  const fulfillmentRequest = await createFulfillmentRequest({
    requestType: "SERVICE_BOOKING",
    vehicleId: vehicle.id,
    buyerId: userId,
    packageTitle: `Service Appointment — ${input.serviceName}`,
    packageDescription: `Certified service appointment booking for ${vehicle.year} ${makeName} ${vehicle.model.name} at ${resolvedShop?.name || input.shopName}`,
    scopedPackageData: bookingPayload,
    partnerName: resolvedShop?.name || input.shopName,
    partnerEmail: resolvedShop?.email || null,
    partnerType: "SERVICE_SHOP",
    status: "SENT",
    parties: [
      {
        partyType: "BUYER",
        userId,
        name: customerName,
        email: customerEmail,
        roleDescription: "Vehicle Passport Owner",
      },
      {
        partyType: "SERVICE_CENTER",
        name: resolvedShop?.name || input.shopName,
        email: resolvedShop?.email || undefined,
        roleDescription: "Certified Service Center",
      },
    ],
    fees: [
      {
        feeType: "SERVICE_FEE",
        amount: depositAmount,
        status: "ESTIMATED",
        description: "SUPERCAR DASH service-booking platform fee, payable after shop acceptance",
      },
    ],
  });

  // 4. Audit & Dispatch Service Booking Email
  const tokenObj = fulfillmentRequest.partnerTokens?.[0];
  const decisionTokenUrl = tokenObj ? `/fulfillment/${tokenObj.token}` : `/transactions/${fulfillmentRequest.id}`;

  await dispatchServiceBookingEmail({
    fulfillmentRequestId: fulfillmentRequest.id,
    shopName: resolvedShop?.name || input.shopName,
    shopEmail: resolvedShop?.email || null,
    decisionTokenUrl,
    packageTitle: fulfillmentRequest.packages?.[0]?.title || `Service Appointment — ${input.serviceName}`,
    vehicleSummary: `${vehicle.year} ${makeName} ${vehicle.model.name} (VIN: ${vehicle.vin})`,
    serviceName: input.serviceName,
    customerName,
    customerPhone: input.customerPhone,
    depositAmount,
  });

  safeRevalidatePath(input.vin);

  return {
    fulfillmentRequestId: fulfillmentRequest.id,
    publicTransactionToken: fulfillmentRequest.publicTransactionToken,
    status: fulfillmentRequest.status,
  };
}
