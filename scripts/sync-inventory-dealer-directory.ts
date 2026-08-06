/**
 * scripts/sync-inventory-dealer-directory.ts
 *
 * Builds/updates PartnerContact rows from real imported inventory dealers.
 * It groups active supported-make listings by dealer/source, crawls the
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
  buildSalesEmailForWebsite,
  emailMatchesWebsiteDomain,
  getHostname,
  isMarketplaceHostname,
  isOfficialDealerMicrositeHostname,
} from "../lib/directory/contact-domain-policy";
import {
  discoverDealerContactFromInventory,
  isLikelyFakeUrl,
} from "../lib/directory/dealer-contact-discovery";
import { SUPPORTED_MAKES, type SupportedMake } from "../lib/supported-makes";

type DirectoryMake = SupportedMake;

const allowedMakes = new Set((process.env.DIRECTORY_MAKES || SUPPORTED_MAKES.join(","))
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
    const candidateDomain = domainFromUrl(candidate.sourceWebsite || candidate.listingUrl);
    if (isUnsupportedRoutingDomain(candidateDomain)) {
      skipped++;
      console.log(`SKIP ${candidate.make} | ${candidate.dealerName} | UNSUPPORTED_ROUTING_DOMAIN | ${candidate.sourceWebsite || candidate.listingUrl}`);
      continue;
    }

    const trusted = await findTrustedDealerContact(candidate.dealerName, candidate.make);
    const discovered = await discoverDealerContactFromInventory({
      ...candidate,
      sourceWebsite: trusted?.website || candidate.sourceWebsite,
      location: candidate.location || trusted?.location,
    });

    const fallbackEmail = buildSalesEmailForWebsite(candidate.listingUrl);
    if (!discovered.verified && fallbackEmail) {
      upserted++;
      console.log(`UPDT ${candidate.make} | ${candidate.dealerName} | ${fallbackEmail} | ${discovered.phone} | ${candidate.listingUrl}`);

      if (!dryRun) {
        await upsertPartnerContact({
          name: candidate.dealerName,
          type: "DEALER",
          email: fallbackEmail,
          phone: discovered.phone,
          website: originFromUrl(candidate.listingUrl),
          sourceDomain: domainFromUrl(candidate.listingUrl),
          makeSpecialization: candidate.make,
          location: discovered.location || candidate.location,
          streetAddress: discovered.streetAddress,
          city: discovered.city,
          state: discovered.state,
          postalCode: discovered.postalCode,
          country: "US",
          marketSourceId: candidate.marketSourceId,
          confidence: "PUBLIC_SOURCE",
          contactSource: "PUBLIC_WEBSITE",
          active: true,
        });
      }
      continue;
    }

    if (!discovered.verified) {
      skipped++;
      console.log(`SKIP ${candidate.make} | ${candidate.dealerName} | ${discovered.reason} | ${discovered.sourceUrl || candidate.sourceWebsite || candidate.listingUrl}`);
      continue;
    }

    const emailForDirectory = pickDealerRoutingEmail(discovered.email, discovered.website)
      ? discovered.email
      : buildSalesEmailForWebsite(discovered.website);

    upserted++;
    console.log(`UPDT ${candidate.make} | ${candidate.dealerName} | ${emailForDirectory} | ${discovered.phone} | ${discovered.sourceUrl}`);

    if (!dryRun) {
      await upsertPartnerContact({
        name: candidate.dealerName,
        type: "DEALER",
        email: emailForDirectory,
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

function pickDealerRoutingEmail(email?: string | null, website?: string | null) {
  if (!emailMatchesWebsiteDomain(email, website)) return null;
  if (!email) return null;
  return /(^sales@|^leads@|sales|internet|info|contact|general)/i.test(email) ? email : null;
}

function isUnsupportedRoutingDomain(domain?: string | null) {
  if (!domain) return false;
  const hostname = getHostname(domain);
  if (!hostname) return false;
  if (isMarketplaceHostname(hostname) || isOfficialDealerMicrositeHostname(hostname)) return true;
  return /(^|\.)mdxprod\.io$/i.test(hostname);
}

async function loadDealerCandidates() {
  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
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
    const listingDomain = domainFromUrl(listing.url);
    const rawDealerName = listing.dealerName || listing.source?.name || null;
    const displayDealerName = !rawDealerName || isGenericCrawlerDealerName(rawDealerName)
      ? nameFromDomain(listingDomain) || listing.dealerName
      : rawDealerName;
    if (
      !displayDealerName ||
      !listing.url ||
      isLikelyFakeUrl(listing.url) ||
      (listing.source?.website ? isLikelyFakeUrl(listing.source.website) : false)
    ) {
      continue;
    }
    if (isLikelyFakeName(displayDealerName) || isLikelyFakeName(listing.source?.name)) continue;

    const key = [
      make,
      normalizeName(displayDealerName),
      domainFromUrl(listing.source?.website || listing.url),
    ].join("|");
    const candidate = {
      dealerName: displayDealerName,
      make: make as DirectoryMake,
      listingUrl: listing.url,
      sourceWebsite: listing.source?.website || null,
      location: listing.location,
      marketSourceId:
        listing.source?.type === "DEALER" &&
        listing.source?.name &&
        normalizeName(listing.source.name) === normalizeName(displayDealerName)
          ? listing.sourceId
          : null,
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

function isGenericCrawlerDealerName(value?: string | null) {
  if (!value) return false;
  return /\b(high-yield|specialist dealers|dealer inventory|dealer network|autotrader|dupont registry|cars\.com)\b/i.test(value);
}

function nameFromDomain(domain?: string | null) {
  if (!domain) return null;
  const base = domain
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/\bnj\b/i, "NJ")
    .replace(/\bny\b/i, "NY")
    .replace(/\bdc\b/i, "DC")
    .replace(/\bfl\b/i, "FL")
    .replace(/\bca\b/i, "CA")
    .replace(/\btx\b/i, "TX");
  const words = base
    .replace(/ferrariof/i, "ferrari of ")
    .replace(/lamborghiniof/i, "lamborghini of ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  return words.map((word) => {
    if (/^(NJ|NY|DC|FL|CA|TX)$/i.test(word)) return word.toUpperCase();
    if (/^of$/i.test(word)) return "of";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(" ");
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

function originFromUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
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
