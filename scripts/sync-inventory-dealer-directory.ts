/**
 * scripts/sync-inventory-dealer-directory.ts
 *
 * Builds/updates PartnerContact rows from real imported inventory dealers.
 * It groups active Ferrari/Lamborghini listings by dealer/source, crawls the
 * dealer/listing/contact URLs, and upserts only verified dealer contact info.
 *
 * This is reusable for future makes: extend allowedMakes when the marketplace
 * expands and the same inventory -> dealer directory flow still applies.
 *
 * Usage:
 *   npm run sync-inventory-dealer-directory
 *   npm run sync-inventory-dealer-directory -- --dry-run
 *   npm run sync-inventory-dealer-directory -- --limit 25
 */

import { prisma } from "../lib/prisma";
import { upsertPartnerContact } from "../lib/fulfillment/partner-registry";
import {
  discoverDealerContactFromInventory,
  isLikelyFakeUrl,
} from "../lib/directory/dealer-contact-discovery";

type DirectoryMake = "Ferrari" | "Lamborghini";

const allowedMakes = new Set((process.env.DIRECTORY_MAKES || "Ferrari,Lamborghini")
  .split(",")
  .map((make) => make.trim())
  .filter(Boolean));
const dryRun = process.argv.includes("--dry-run");
const limit = parseLimit(process.argv.slice(2));

async function main() {
  const candidates = await loadDealerCandidates();
  const limited = limit ? candidates.slice(0, limit) : candidates;

  console.log("==================================================");
  console.log("  SUPERCAR DASH Inventory Dealer Directory Sync");
  console.log("==================================================");
  console.log(`Mode: ${dryRun ? "dry run" : "upsert verified dealers"}`);
  console.log(`Dealer candidates: ${candidates.length}`);
  console.log(`Inspected this run: ${limited.length}\n`);

  let upserted = 0;
  let skipped = 0;

  for (const candidate of limited) {
    const trusted = await findTrustedDealerContact(candidate.dealerName, candidate.make);
    const discovered = await discoverDealerContactFromInventory({
      ...candidate,
      sourceWebsite: trusted?.website || candidate.sourceWebsite,
      location: candidate.location || trusted?.location,
    });

    if (!discovered.verified) {
      skipped++;
      console.log(`SKIP ${candidate.make} | ${candidate.dealerName} | ${discovered.reason} | ${discovered.sourceUrl || candidate.sourceWebsite || candidate.listingUrl}`);
      continue;
    }

    upserted++;
    console.log(`UPDT ${candidate.make} | ${candidate.dealerName} | ${discovered.email} | ${discovered.phone} | ${discovered.sourceUrl}`);

    if (!dryRun) {
      await upsertPartnerContact({
        name: candidate.dealerName,
        type: "DEALER",
        email: discovered.email,
        phone: discovered.phone,
        website: discovered.website,
        sourceDomain: domainFromUrl(discovered.website),
        makeSpecialization: candidate.make,
        location: discovered.location || candidate.location,
        streetAddress: discovered.streetAddress,
        city: discovered.city,
        state: discovered.state,
        postalCode: discovered.postalCode,
        country: "US",
        marketSourceId: candidate.marketSourceId,
        confidence: "VERIFIED",
        contactSource: "PUBLIC_WEBSITE",
        active: true,
      });
    }
  }

  console.log("\n==================================================");
  console.log(`  Upserted: ${upserted}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log("==================================================");
}

async function loadDealerCandidates() {
  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      dealerName: { not: null },
      url: { not: null },
      model: {
        make: {
          name: { in: Array.from(allowedMakes) },
        },
      },
    },
    select: {
      dealerName: true,
      location: true,
      url: true,
      sourceId: true,
      source: { select: { name: true, website: true, type: true } },
      model: { select: { make: { select: { name: true } } } },
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const grouped = new Map<string, {
    dealerName: string;
    make: DirectoryMake;
    listingUrl: string;
    sourceWebsite: string | null;
    location: string | null;
    marketSourceId: string | null;
    updatedAt: Date;
  }>();

  for (const listing of listings) {
    const make = listing.model.make.name;
    if (!allowedMakes.has(make)) continue;
    if (!listing.dealerName || !listing.url || isLikelyFakeUrl(listing.url) || isLikelyFakeUrl(listing.source?.website)) continue;
    if (isLikelyFakeName(listing.dealerName) || isLikelyFakeName(listing.source?.name)) continue;

    const key = [
      make,
      normalizeName(listing.dealerName),
      domainFromUrl(listing.source?.website || listing.url),
    ].join("|");
    const candidate = {
      dealerName: listing.dealerName,
      make: make as DirectoryMake,
      listingUrl: listing.url,
      sourceWebsite: listing.source?.website || null,
      location: listing.location,
      marketSourceId: listing.sourceId,
      updatedAt: listing.updatedAt,
    };

    const existing = grouped.get(key);
    if (!existing || candidate.updatedAt > existing.updatedAt) {
      grouped.set(key, candidate);
    }
  }

  return Array.from(grouped.values());
}

function parseLimit(args: string[]) {
  const index = args.indexOf("--limit");
  const parsed = index >= 0 ? Number(args[index + 1]) : undefined;
  return Number.isFinite(parsed) && parsed! > 0 ? parsed : undefined;
}

function isLikelyFakeName(value?: string | null) {
  if (!value) return false;
  return /\b(test|demo|dummy|sprint|admin ops|transaction center|supercars 9b|financial settlement)\b/i.test(value);
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function findTrustedDealerContact(dealerName: string, make: string) {
  const exact = await prisma.partnerContact.findFirst({
    where: {
      type: "DEALER",
      makeSpecialization: make,
      OR: [
        { name: dealerName },
        { name: { contains: dealerName, mode: "insensitive" } },
      ],
      website: { not: null },
    },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    select: { website: true, location: true, city: true, state: true },
  });
  if (exact) return exact;

  const candidates = await prisma.partnerContact.findMany({
    where: {
      type: "DEALER",
      makeSpecialization: make,
      website: { not: null },
    },
    select: { name: true, website: true, location: true, city: true, state: true },
  });

  const target = normalizeName(dealerName);
  return candidates.find((candidate) => {
    const normalized = normalizeName(candidate.name);
    return normalized.includes(target) || target.includes(normalized);
  }) || null;
}

function domainFromUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

main()
  .catch((error) => {
    console.error("Inventory dealer directory sync failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
