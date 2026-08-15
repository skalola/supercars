"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isValidVin } from "@/lib/market-crawlers/vin-extractor";
import { createFulfillmentRequest } from "@/lib/fulfillment/service";
import { resolvePartnerContact } from "@/lib/fulfillment/partner-registry";
import {
  generateServiceBookingPackagePayload,
} from "@/lib/fulfillment/service-booking-package";
import { getServiceBookingFeeCents } from "@/lib/payments/payment-service";
import { isSupportedMake } from "@/lib/supported-makes";
import { vinClaimSchema } from "@/lib/validation/transaction-inputs";
import { serviceBookingInputSchema } from "@/lib/validation/owner-transaction-inputs";
import {
  completeMaintenanceInputSchema,
  deleteVehicleModificationInputSchema,
  serviceRecordInputSchema,
  vehicleAwardInputSchema,
  vehicleInstalledPartInputSchema,
  vehicleModificationInputSchema,
  vehicleProfileInputSchema,
} from "@/lib/validation/passport-inputs";

function safeRevalidatePath(vin: string) {
  try {
    revalidatePath(`/vehicle/${vin}`);
    revalidatePath(`/vehicle/${vin}/edit`);
    revalidatePath("/garage");
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
    },
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
  const profileInput = vehicleProfileInputSchema.parse(data);

  await prisma.$transaction([
    prisma.vehicleProfile.upsert({
      where: { vehicleId },
      update: {
        exteriorColor: profileInput.exteriorColor,
        interiorColor: profileInput.interiorColor,
        currentMileage: profileInput.currentMileage,
        ownerNotes: profileInput.ownerNotes,
      },
      create: {
        vehicleId,
        exteriorColor: profileInput.exteriorColor,
        interiorColor: profileInput.interiorColor,
        currentMileage: profileInput.currentMileage,
        ownerNotes: profileInput.ownerNotes,
      },
    }),
    prisma.vehicle.update({
      where: { id: vehicleId },
      data: { mileage: profileInput.currentMileage },
    }),
  ]);

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
  const modificationInput = vehicleModificationInputSchema.parse(data);

  await prisma.$transaction(async (tx) => {
    const modification = await tx.vehicleModification.create({
      data: {
        vehicleId,
        name: modificationInput.name,
        brand: modificationInput.brand,
        description: modificationInput.description,
        installedDate: modificationInput.installedDate,
      },
    });

    await tx.vehicleInstalledPart.create({
      data: {
        vehicleId,
        userId,
        legacyModificationId: modification.id,
        categoryId: modificationInput.categoryId,
        customName: modificationInput.name,
        customBrandName: modificationInput.brand,
        installedDate: modificationInput.installedDate,
        notes: modificationInput.description,
        hpGainOverride: modificationInput.hpGainOverride,
        torqueGainOverride: modificationInput.torqueGainOverride,
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
  const installedPartInput = vehicleInstalledPartInputSchema.parse(data);

  const part = await prisma.performancePart.findUnique({
    where: { id: installedPartInput.partId },
    select: {
      id: true,
      name: true,
      description: true,
      categoryId: true,
      componentTypeId: true,
      status: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
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
        description: installedPartInput.notes || part.description || part.category.name,
        installedDate: installedPartInput.installedDate,
      },
    });

    await tx.vehicleInstalledPart.create({
      data: {
        vehicleId,
        userId,
        partId: part.id,
        legacyModificationId: modification.id,
        categoryId: part.categoryId,
        componentTypeId: part.componentTypeId,
        installedDate: installedPartInput.installedDate,
        notes: installedPartInput.notes,
        hpGainOverride: installedPartInput.hpGainOverride,
        torqueGainOverride: installedPartInput.torqueGainOverride,
        verificationStatus: "OWNER_REPORTED",
      },
    });
  });

  safeRevalidatePath(vin);
}

export async function deleteVehicleModification(
  vin: string,
  data: {
    modificationId?: string | null;
    installedPartId?: string | null;
  }
) {
  const { vehicleId } = await verifyOwnership(vin);
  const { modificationId, installedPartId } = deleteVehicleModificationInputSchema.parse(data);

  await prisma.$transaction(async (tx) => {
    const installedPart = installedPartId
      ? await tx.vehicleInstalledPart.findFirst({
          where: { id: installedPartId, vehicleId },
          select: { id: true, legacyModificationId: true },
        })
      : modificationId
        ? await tx.vehicleInstalledPart.findFirst({
            where: { legacyModificationId: modificationId, vehicleId },
            select: { id: true, legacyModificationId: true },
          })
        : null;

    const targetModificationId = modificationId || installedPart?.legacyModificationId || null;

    if (installedPart) {
      await tx.vehicleInstalledPart.delete({ where: { id: installedPart.id } });
    }

    if (targetModificationId) {
      const deleted = await tx.vehicleModification.deleteMany({
        where: { id: targetModificationId, vehicleId },
      });

      if (!installedPart && deleted.count === 0) {
        throw new Error("Modification not found.");
      }
    } else if (!installedPart) {
      throw new Error("Modification not found.");
    }
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
  const serviceInput = serviceRecordInputSchema.parse(data);

  await prisma.serviceRecord.create({
    data: {
      vehicleId,
      serviceDate: new Date(serviceInput.serviceDate),
      mileage: serviceInput.mileage,
      shopName: serviceInput.shopName,
      description: serviceInput.description,
      cost: serviceInput.cost,
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
  const maintenanceInput = completeMaintenanceInputSchema.parse(data);
  const dbDescription = `[${maintenanceInput.serviceName}] ${maintenanceInput.description || ""}`.trim();

  await prisma.serviceRecord.create({
    data: {
      vehicleId,
      serviceDate: new Date(maintenanceInput.serviceDate),
      mileage: maintenanceInput.mileage,
      shopName: maintenanceInput.shopName,
      description: dbDescription,
      cost: maintenanceInput.cost,
    },
  });

  const profile = await prisma.vehicleProfile.findUnique({
    where: { vehicleId },
  });

  if (!profile || profile.currentMileage === null || maintenanceInput.mileage > profile.currentMileage) {
    await prisma.vehicleProfile.upsert({
      where: { vehicleId },
      update: { currentMileage: maintenanceInput.mileage },
      create: { vehicleId, currentMileage: maintenanceInput.mileage },
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
  const awardInput = vehicleAwardInputSchema.parse(data);

  await prisma.vehicleAward.create({
    data: {
      vehicleId,
      title: awardInput.title,
      eventName: awardInput.eventName,
      awardDate: awardInput.awardDate ? new Date(awardInput.awardDate) : null,
      description: awardInput.description,
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
  acceptedTerms: boolean;
}

export async function createServiceBookingPackage(input: CreateServiceBookingInput) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: Please sign in to book service.");
  }
  const bookingInput = serviceBookingInputSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, username: true, email: true },
  });

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin: bookingInput.vin },
    select: {
      id: true,
      ownerId: true,
      status: true,
      vin: true,
      year: true,
      model: {
        select: {
          name: true,
          make: { select: { name: true } },
        },
      },
      profile: {
        select: {
          currentMileage: true,
        },
      },
    },
  });

  if (!vehicle) {
    throw new Error("Vehicle passport not found.");
  }

  if (vehicle.ownerId !== userId || vehicle.status !== "CLAIMED") {
    throw new Error("Unauthorized: You do not own this claimed vehicle.");
  }

  if (!isValidVin(vehicle.vin)) {
    throw new Error("Service booking packages require a valid VIN-backed supported supercar vehicle.");
  }

  const makeName = vehicle.model.make.name;
  if (!isSupportedMake(makeName)) {
    throw new Error("Service booking packages are only supported for supported supercar makes.");
  }

  // 1. Resolve Certified Service Shop Partner Contact
  const resolvedShop = await resolvePartnerContact({
    name: bookingInput.shopName,
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
    serviceRequested: bookingInput.serviceName,
    preferredDate: bookingInput.preferredDate,
    preferredTime: bookingInput.preferredTime,
    customerName,
    customerEmail,
    customerPhone: bookingInput.customerPhone,
    shopName: resolvedShop?.name || bookingInput.shopName,
    shopEmail: resolvedShop?.email || null,
    notes: bookingInput.notes,
    attachedDocumentCount: await prisma.vehicleDocument.count({ where: { vehicleId: vehicle.id } }),
    depositAmount,
    termsAcceptedAt: new Date().toISOString(),
  });

  // 3. Create an undispatched request. Stripe authorization must be verified
  // before the partner receives the tokenized service package.
  const fulfillmentRequest = await createFulfillmentRequest({
    requestType: "SERVICE_BOOKING",
    vehicleId: vehicle.id,
    buyerId: userId,
    packageTitle: `Service Appointment — ${bookingInput.serviceName}`,
    packageDescription: `Certified service appointment booking for ${vehicle.year} ${makeName} ${vehicle.model.name} at ${resolvedShop?.name || bookingInput.shopName}`,
    scopedPackageData: bookingPayload,
    partnerName: resolvedShop?.name || bookingInput.shopName,
    partnerEmail: resolvedShop?.email || null,
    partnerType: "SERVICE_SHOP",
    status: "READY_TO_SEND",
    paymentStatus: "PAYMENT_REQUIRED",
    suppressBuyerConfirmation: true,
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
        name: resolvedShop?.name || bookingInput.shopName,
        email: resolvedShop?.email || undefined,
        roleDescription: "Certified Service Center",
      },
    ],
    fees: [
      {
        feeType: "SERVICE_FEE",
        amount: depositAmount,
        status: "ESTIMATED",
        description: "SUPERCAR DASH service-booking platform fee, authorized before dispatch and captured after acceptance",
      },
    ],
  });

  safeRevalidatePath(bookingInput.vin);

  return {
    fulfillmentRequestId: fulfillmentRequest.id,
    publicTransactionToken: fulfillmentRequest.publicTransactionToken,
    status: fulfillmentRequest.status,
  };
}
