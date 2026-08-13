import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { emailMatchesWebsiteDomain } from "@/lib/directory/contact-domain-policy";
import { isValidEmail } from "@/lib/fulfillment/partner-registry";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";

const TARGET_MAKES = [...SUPPORTED_MAKES];
const AUCTION_DOMAINS = ["bringatrailer.com"];

async function main() {
  const partnerContacts = await prisma.partnerContact.findMany({
    where: { active: true },
    select: {
      id: true,
      email: true,
      website: true,
      _count: {
        select: {
          fulfillmentParties: true,
        },
      },
    },
    take: 1000,
  });
  const contactsWithoutValidEmail = partnerContacts.filter((contact) => !isValidEmail(contact.email));
  const contactsWithMismatchedDomains = partnerContacts.filter(
    (contact) =>
      isValidEmail(contact.email) &&
      contact.website &&
      !emailMatchesWebsiteDomain(contact.email, contact.website),
  );

  const vendorUpdate = await prisma.partnerContact.updateMany({
    where: {
      id: { in: contactsWithoutValidEmail.map((contact) => contact.id) },
    },
    data: {
      contactStatus: "UNRESOLVED_EMAIL",
      confidence: "UNRESOLVED_EMAIL",
    },
  });

  const mismatchedVendorHeld = await prisma.partnerContact.updateMany({
    where: {
      id: {
        in: contactsWithMismatchedDomains.map((contact) => contact.id),
      },
    },
    data: {
      contactStatus: "RESOLVED",
      confidence: "MANUAL_REVIEW",
    },
  });

  const removedNoVinNoPrice = await prisma.listing.deleteMany({
    where: {
      vehicleId: null,
      AND: [
        { OR: [{ price: null }, { price: { lte: 0 } }] },
        { OR: [{ askingPrice: null }, { askingPrice: { lte: 0 } }] },
      ],
    },
  });

  const missingVehicleWhere: Prisma.ListingWhereInput = {
    status: "ACTIVE",
    vehicleId: null,
  };
  const removedNoVinListings = await prisma.listing.deleteMany({
    where: {
      ...missingVehicleWhere,
      purchases: { none: {} },
      fulfillmentRequests: { none: {} },
    },
  });
  const heldInactiveNoVinListings = await prisma.listing.updateMany({
    where: {
      ...missingVehicleWhere,
      OR: [{ purchases: { some: {} } }, { fulfillmentRequests: { some: {} } }],
    },
    data: {
      status: "INACTIVE",
      validationStatus: "VIN_MISSING",
      freshnessStatus: "INACTIVE",
    },
  });

  const inactiveNeedsReviewListings = await prisma.listing.updateMany({
    where: {
      status: "ACTIVE",
      vehicle: {
        is: {
          inventoryStatus: "NEEDS_REVIEW",
        },
      },
    },
    data: {
      status: "INACTIVE",
      freshnessStatus: "INACTIVE",
      validationStatus: "NEEDS_REVIEW",
    },
  });

  const deactivatedVinNoPrice = await prisma.listing.updateMany({
    where: {
      status: "ACTIVE",
      vehicleId: { not: null },
      AND: [
        { OR: [{ price: null }, { price: { lte: 0 } }] },
        { OR: [{ askingPrice: null }, { askingPrice: { lte: 0 } }] },
      ],
    },
    data: {
      status: "INACTIVE",
      priceStatus: "PRICE_MISSING",
      freshnessStatus: "INACTIVE",
    },
  });

  const missingImageWhere: Prisma.ListingWhereInput = {
    status: "ACTIVE",
    vehicleId: { not: null },
    OR: [{ imageUrl: null }, { imageUrl: "" }],
  };
  const removedVinNoImage = await prisma.listing.deleteMany({
    where: {
      ...missingImageWhere,
      purchases: { none: {} },
      fulfillmentRequests: { none: {} },
    },
  });
  const heldRemovedVinNoImage = await prisma.listing.updateMany({
    where: {
      AND: [
        missingImageWhere,
        { OR: [{ purchases: { some: {} } }, { fulfillmentRequests: { some: {} } }] },
      ],
    },
    data: {
      status: "REMOVED",
      freshnessStatus: "REMOVED",
      validationStatus: "IMAGE_MISSING",
    },
  });

  const nonTargetWhere: Prisma.ListingWhereInput = {
    status: "ACTIVE",
    vehicle: {
      is: { model: { make: { name: { notIn: TARGET_MAKES } } } },
    },
  };
  const removedNonTargetListings = await prisma.listing.deleteMany({
    where: {
      ...nonTargetWhere,
      purchases: { none: {} },
      fulfillmentRequests: { none: {} },
    },
  });
  const heldRemovedNonTargetListings = await prisma.listing.updateMany({
    where: {
      ...nonTargetWhere,
      OR: [{ purchases: { some: {} } }, { fulfillmentRequests: { some: {} } }],
    },
    data: {
      status: "REMOVED",
      freshnessStatus: "REMOVED",
      validationStatus: "MAKE_MISMATCH",
    },
  });

  const auctionWhere: Prisma.ListingWhereInput = {
    status: "ACTIVE",
    OR: [
      { source: { is: { type: "AUCTION" } } },
      ...AUCTION_DOMAINS.map((domain) => ({
        url: { contains: domain, mode: "insensitive" as const },
      })),
    ],
  };
  const removedAuctionListings = await prisma.listing.deleteMany({
    where: {
      ...auctionWhere,
      purchases: { none: {} },
      fulfillmentRequests: { none: {} },
    },
  });
  const heldRemovedAuctionListings = await prisma.listing.updateMany({
    where: {
      AND: [
        auctionWhere,
        { OR: [{ purchases: { some: {} } }, { fulfillmentRequests: { some: {} } }] },
      ],
    },
    data: {
      status: "REMOVED",
      freshnessStatus: "REMOVED",
      validationStatus: "AUCTION_SOURCE",
    },
  });

  console.log(
    JSON.stringify(
      {
        vendorsMarkedUnverifiedForMissingEmail: vendorUpdate.count,
        vendorsMarkedManualReviewForEmailWebsiteDomainMismatch: mismatchedVendorHeld.count,
        listingsRemovedNoVinNoPrice: removedNoVinNoPrice.count,
        activeListingsRemovedForMissingVin: removedNoVinListings.count,
        activeListingsHeldInactiveForMissingVin: heldInactiveNoVinListings.count,
        activeListingsDeactivatedForVehicleReview: inactiveNeedsReviewListings.count,
        vinBackedListingsDeactivatedForMissingPrice: deactivatedVinNoPrice.count,
        vinBackedListingsRemovedForMissingImage: removedVinNoImage.count,
        vinBackedListingsHeldAsRemovedForMissingImage: heldRemovedVinNoImage.count,
        nonTargetMakeListingsRemoved: removedNonTargetListings.count,
        nonTargetMakeListingsHeldAsRemoved: heldRemovedNonTargetListings.count,
        auctionListingsRemovedFromInventory: removedAuctionListings.count,
        auctionListingsHeldAsRemoved: heldRemovedAuctionListings.count,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
