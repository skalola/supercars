import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { canTransitionUserPartListing } from "@/lib/parts/user-part-listing-policy";
import {
  getUserPartShippingRestriction,
  isCurrentSellerAttestation,
  USER_PART_SELLER_POLICY_VERSION,
  type UserPartShippingRestriction,
} from "@/lib/parts/user-part-compliance-policy";
import { isSellerPaymentReady } from "@/lib/payments/stripe-connect-policy";
import { prisma } from "@/lib/prisma";
import {
  userPartListingInputSchema,
  type UserPartListingInput,
} from "@/lib/validation/user-part-listing-inputs";

export async function assertSellerPaymentsReady(userId: string) {
  const account = await prisma.sellerPaymentAccount.findUnique({
    where: { userId },
    select: { onboardingStatus: true, chargesEnabled: true, payoutsEnabled: true },
  });
  if (!account || !isSellerPaymentReady(account)) {
    throw new Error("Complete Stripe seller setup before publishing parts.");
  }
  return account;
}

function fitmentKey(listingId: string, fitment: UserPartListingInput["fitments"][number]) {
  const normalized = [
    listingId,
    fitment.makeId,
    fitment.modelId,
    fitment.modelVariantId || "*",
    fitment.yearStart || "*",
    fitment.yearEnd || "*",
    fitment.trim || "*",
    fitment.engine || "*",
    fitment.transmission || "*",
    fitment.drivetrain || "*",
    fitment.bodyStyle || "*",
  ].join("|").toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function validateListingReferences(userId: string, input: UserPartListingInput) {
  const modelIds = [...new Set(input.fitments.map((fitment) => fitment.modelId))];
  const variantIds = [...new Set(input.fitments.flatMap((fitment) => fitment.modelVariantId ? [fitment.modelVariantId] : []))];
  const [component, brand, removedVehicle, models, variants] = await Promise.all([
    prisma.partComponentType.findFirst({
      where: { id: input.componentTypeId, active: true },
      select: { id: true, name: true, allowsUniversalFitment: true, category: { select: { name: true } } },
    }),
    input.brandId ? prisma.partBrand.findFirst({ where: { id: input.brandId, active: true }, select: { id: true, name: true } }) : null,
    input.removedFromVehicleId ? prisma.vehicle.findFirst({
      where: { id: input.removedFromVehicleId, ownerId: userId },
      select: { id: true, modelId: true },
    }) : null,
    modelIds.length ? prisma.model.findMany({
      where: { id: { in: modelIds } },
      select: { id: true, makeId: true, productionStartYear: true, productionEndYear: true },
    }) : [],
    variantIds.length ? prisma.modelVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, modelId: true, productionStartYear: true, productionEndYear: true },
    }) : [],
  ]);

  if (!component) throw new Error("Select an active parts component.");
  if (input.universalFitment && !component.allowsUniversalFitment) {
    throw new Error("This component requires vehicle-specific fitment.");
  }
  if (input.brandId && !brand) throw new Error("Select an active part brand.");
  if (input.removedFromVehicleId && !removedVehicle) throw new Error("The removed-from vehicle must belong to your garage.");
  const shippingRestriction = getUserPartShippingRestriction({
    componentName: component.name,
    categoryName: component.category.name,
  });
  if (shippingRestriction === "LOCAL_PICKUP_ONLY" && input.shippingMode !== "LOCAL_PICKUP") {
    throw new Error("This shipping-sensitive component must be listed for local pickup.");
  }

  const modelMap = new Map(models.map((model) => [model.id, model]));
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  for (const fitment of input.fitments) {
    const model = modelMap.get(fitment.modelId);
    if (!model || model.makeId !== fitment.makeId) throw new Error("A selected model does not belong to the selected make.");
    const variant = fitment.modelVariantId ? variantMap.get(fitment.modelVariantId) : null;
    if (fitment.modelVariantId && (!variant || variant.modelId !== fitment.modelId)) {
      throw new Error("A selected trim does not belong to the selected model.");
    }
    const productionStart = variant?.productionStartYear ?? model.productionStartYear;
    const productionEnd = variant?.productionEndYear ?? model.productionEndYear;
    if (productionStart && fitment.yearStart && fitment.yearStart < productionStart) {
      throw new Error("Fitment starts before the selected vehicle was produced.");
    }
    if (productionEnd && fitment.yearEnd && fitment.yearEnd > productionEnd) {
      throw new Error("Fitment ends after the selected vehicle stopped production.");
    }
  }

  return { brandName: brand?.name || input.brandName, shippingRestriction };
}

function listingData(
  input: UserPartListingInput,
  normalizedBrandName: string | null | undefined,
  shippingRestriction: UserPartShippingRestriction,
) {
  return {
    componentTypeId: input.componentTypeId,
    brandId: input.brandId,
    removedFromVehicleId: input.removedFromVehicleId,
    title: input.title,
    description: input.description,
    brandName: normalizedBrandName || null,
    manufacturerPartNumber: input.manufacturerPartNumber,
    condition: input.condition,
    priceCents: input.priceCents,
    currency: input.currency,
    quantity: input.quantity,
    mileageOnPart: input.mileageOnPart,
    includedHardware: input.includedHardware,
    knownDefects: input.knownDefects,
    shippingMode: input.shippingMode,
    shippingCostCents: input.shippingMode === "LOCAL_PICKUP" ? null : input.shippingCostCents,
    shipsFromCity: input.shipsFromCity,
    shipsFromState: input.shipsFromState,
    returnPolicy: input.returnPolicy,
    shippingRestriction,
    sellerAttestedAt: input.sellerAttestationAccepted ? new Date() : null,
    sellerPolicyVersion: input.sellerAttestationAccepted ? USER_PART_SELLER_POLICY_VERSION : null,
    universalFitment: input.universalFitment,
  };
}

function fitmentRows(listingId: string, input: UserPartListingInput) {
  return input.fitments.map((fitment) => ({
    listingId,
    fitmentKey: fitmentKey(listingId, fitment),
    ...fitment,
    confidence: "SELLER_DECLARED",
  }));
}

export async function createUserPartListing(userId: string, rawInput: unknown) {
  const input = userPartListingInputSchema.parse(rawInput);
  const references = await validateListingReferences(userId, input);
  return prisma.$transaction(async (transaction) => {
    const listing = await transaction.userPartListing.create({
      data: { sellerId: userId, ...listingData(input, references.brandName, references.shippingRestriction) },
      select: { id: true, status: true },
    });
    const rows = fitmentRows(listing.id, input);
    if (rows.length) await transaction.userPartListingFitment.createMany({ data: rows });
    return listing;
  });
}

export async function updateUserPartListing(userId: string, listingId: string, rawInput: unknown) {
  const input = userPartListingInputSchema.parse(rawInput);
  const existing = await prisma.userPartListing.findFirst({
    where: { id: listingId, sellerId: userId, status: { notIn: ["SOLD", "REMOVED"] } },
    select: { id: true },
  });
  if (!existing) throw new Error("This part listing cannot be edited.");
  const references = await validateListingReferences(userId, input);
  return prisma.$transaction(async (transaction) => {
    await transaction.userPartListingFitment.deleteMany({ where: { listingId } });
    const rows = fitmentRows(listingId, input);
    if (rows.length) await transaction.userPartListingFitment.createMany({ data: rows });
    return transaction.userPartListing.update({
      where: { id: listingId },
      data: listingData(input, references.brandName, references.shippingRestriction),
    });
  });
}

export async function duplicateUserPartListing(userId: string, listingId: string) {
  const source = await prisma.userPartListing.findFirst({
    where: { id: listingId, sellerId: userId, status: { not: "REMOVED" } },
    select: {
      componentTypeId: true,
      brandId: true,
      removedFromVehicleId: true,
      title: true,
      description: true,
      brandName: true,
      manufacturerPartNumber: true,
      condition: true,
      priceCents: true,
      currency: true,
      quantity: true,
      mileageOnPart: true,
      includedHardware: true,
      knownDefects: true,
      shippingMode: true,
      shippingCostCents: true,
      shipsFromCity: true,
      shipsFromState: true,
      returnPolicy: true,
      shippingRestriction: true,
      universalFitment: true,
      fitments: {
        select: {
          makeId: true,
          modelId: true,
          modelVariantId: true,
          yearStart: true,
          yearEnd: true,
          trim: true,
          engine: true,
          transmission: true,
          drivetrain: true,
          bodyStyle: true,
          confidence: true,
        },
      },
    },
  });
  if (!source) throw new Error("This part listing cannot be duplicated.");

  return prisma.$transaction(async (transaction) => {
    const { fitments, ...listing } = source;
    const duplicate = await transaction.userPartListing.create({
      data: {
        ...listing,
        sellerId: userId,
        status: "DRAFT",
        sellerAttestedAt: null,
        sellerPolicyVersion: null,
        publishedAt: null,
      },
      select: { id: true, status: true },
    });
    if (fitments.length) {
      await transaction.userPartListingFitment.createMany({
        data: fitments.map((fitment) => ({
          ...fitment,
          listingId: duplicate.id,
          fitmentKey: fitmentKey(duplicate.id, fitment),
        })),
      });
    }
    return duplicate;
  });
}

export async function transitionUserPartListing(userId: string, listingId: string, nextStatus: string) {
  const listing = await prisma.userPartListing.findFirst({
    where: { id: listingId, sellerId: userId },
    select: {
      id: true,
      status: true,
      universalFitment: true,
      shippingMode: true,
      shippingRestriction: true,
      sellerAttestedAt: true,
      sellerPolicyVersion: true,
      _count: { select: { images: { where: { validationStatus: "VALID" } }, fitments: true } },
    },
  });
  if (!listing) throw new Error("Part listing not found.");
  if (!canTransitionUserPartListing(listing.status, nextStatus)) throw new Error("That listing status change is not allowed.");

  if (nextStatus === "ACTIVE") {
    await assertSellerPaymentsReady(userId);
    if (listing._count.images === 0) throw new Error("Add at least one valid part photo before publishing.");
    if (!listing.universalFitment && listing._count.fitments === 0) throw new Error("Add compatible vehicles before publishing.");
    if (!isCurrentSellerAttestation(listing)) {
      throw new Error("Accept the current seller attestation before publishing.");
    }
    if (listing.shippingRestriction === "LOCAL_PICKUP_ONLY" && listing.shippingMode !== "LOCAL_PICKUP") {
      throw new Error("This shipping-sensitive component must be listed for local pickup.");
    }
  }

  const now = new Date();
  const data: Prisma.UserPartListingUpdateInput = { status: nextStatus };
  if (nextStatus === "ACTIVE") data.publishedAt = now;
  if (nextStatus === "SOLD") data.soldAt = now;
  if (nextStatus === "REMOVED") data.removedAt = now;
  return prisma.userPartListing.update({ where: { id: listing.id }, data });
}
