import { prisma } from "@/lib/prisma";
import { emailMatchesWebsiteDomain } from "@/lib/directory/contact-domain-policy";
import { isValidEmail } from "@/lib/fulfillment/partner-registry";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";

const TARGET_MAKES = [...SUPPORTED_MAKES];
const AUCTION_DOMAINS = ["bringatrailer.com"];

function hasUsablePrice(listing: { price: number | null; askingPrice: number | null }) {
  return (listing.askingPrice !== null && listing.askingPrice > 0) || (listing.price !== null && listing.price > 0);
}

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

  const noVinNoPriceListings = await prisma.listing.findMany({
    where: {
      vehicleId: null,
      AND: [
        { OR: [{ price: null }, { price: { lte: 0 } }] },
        { OR: [{ askingPrice: null }, { askingPrice: { lte: 0 } }] },
      ],
    },
    select: { id: true },
  });

  const removedNoVinNoPrice = await prisma.listing.deleteMany({
    where: {
      id: { in: noVinNoPriceListings.map((listing) => listing.id) },
    },
  });

  const activeVinListings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      vehicleId: { not: null },
    },
    select: {
      id: true,
      price: true,
      askingPrice: true,
    },
  });
  const activeVinListingsWithoutPrice = activeVinListings.filter((listing) => !hasUsablePrice(listing));

  const deactivatedVinNoPrice = await prisma.listing.updateMany({
    where: {
      id: { in: activeVinListingsWithoutPrice.map((listing) => listing.id) },
    },
    data: {
      status: "INACTIVE",
      priceStatus: "PRICE_MISSING",
      freshnessStatus: "INACTIVE",
    },
  });

  const nonTargetListings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      vehicle: {
        is: {
          model: {
            make: {
              name: { notIn: TARGET_MAKES },
            },
          },
        },
      },
    },
    select: {
      id: true,
      _count: {
        select: {
          purchases: true,
          fulfillmentRequests: true,
        },
      },
    },
  });
  const deletableNonTargetListings = nonTargetListings.filter(
    (listing) => listing._count.purchases === 0 && listing._count.fulfillmentRequests === 0,
  );
  const heldNonTargetListings = nonTargetListings.filter(
    (listing) => listing._count.purchases > 0 || listing._count.fulfillmentRequests > 0,
  );

  const removedNonTargetListings = await prisma.listing.deleteMany({
    where: {
      id: { in: deletableNonTargetListings.map((listing) => listing.id) },
    },
  });
  const heldRemovedNonTargetListings = await prisma.listing.updateMany({
    where: {
      id: { in: heldNonTargetListings.map((listing) => listing.id) },
    },
    data: {
      status: "REMOVED",
      freshnessStatus: "REMOVED",
      validationStatus: "MAKE_MISMATCH",
    },
  });

  const auctionListings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { source: { is: { type: "AUCTION" } } },
        ...AUCTION_DOMAINS.map((domain) => ({
          url: { contains: domain, mode: "insensitive" as const },
        })),
      ],
    },
    select: {
      id: true,
      _count: {
        select: {
          purchases: true,
          fulfillmentRequests: true,
        },
      },
    },
  });
  const deletableAuctionListings = auctionListings.filter(
    (listing) => listing._count.purchases === 0 && listing._count.fulfillmentRequests === 0,
  );
  const heldAuctionListings = auctionListings.filter(
    (listing) => listing._count.purchases > 0 || listing._count.fulfillmentRequests > 0,
  );
  const removedAuctionListings = await prisma.listing.deleteMany({
    where: {
      id: { in: deletableAuctionListings.map((listing) => listing.id) },
    },
  });
  const heldRemovedAuctionListings = await prisma.listing.updateMany({
    where: {
      id: { in: heldAuctionListings.map((listing) => listing.id) },
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
        vinBackedListingsDeactivatedForMissingPrice: deactivatedVinNoPrice.count,
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
