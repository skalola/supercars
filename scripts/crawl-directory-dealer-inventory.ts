import { prisma } from "@/lib/prisma";
import { crawlInventory } from "@/lib/market-crawlers/crawler-engine";
import { PublicPageSource } from "@/lib/market-crawlers/sources/public-page-source";
import { isDealerOwnedWebsite } from "@/lib/directory/contact-domain-policy";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";
import { getBatchLimit, getBatchOffset, getRotatingBatchOffset } from "./lib/script-guards";

const allowedMakes = new Set(
  (process.env.DIRECTORY_MAKES || SUPPORTED_MAKES.join(","))
    .split(",")
    .map((make) => make.trim())
    .filter(Boolean),
);

const limit = getBatchLimit({ defaultLimit: 40, maxLimit: 100 });
const requestedOffset = getBatchOffset();

async function main() {
  const contacts = await prisma.partnerContact.findMany({
    where: {
      type: "DEALER",
      active: true,
      website: { not: null },
    },
    select: {
      id: true,
      name: true,
      website: true,
      email: true,
      makeSpecialization: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take: 500,
  });

  const eligible = contacts
    .filter((contact) => contact.website && isDealerOwnedWebsite(contact.website))
    .filter((contact) => !isLikelyFixtureContact(contact.name, contact.website, contact.email))
    .filter((contact) => {
      const specialization = contact.makeSpecialization || "ALL";
      return specialization === "ALL" || Array.from(allowedMakes).some((make) => specialization.includes(make));
    });
  const offset = getRotatingBatchOffset(eligible.length, limit, requestedOffset);
  const selected = eligible.slice(offset, offset + limit);

  const sources = selected.map(
    (contact) =>
      new PublicPageSource({
        sourceName: contact.name,
        sourceType: "DEALER",
        urls: buildInventoryUrls(contact.website!),
        discoverDetailLinks: true,
        maxDetailPages: Number(process.env.DIRECTORY_DEALER_MAX_DETAIL_PAGES || 40),
      }),
  );

  console.log("==================================================");
  console.log("  SUPERCAR DASH Directory Dealer Inventory Crawl");
  console.log("==================================================");
  console.log(`Dealer sources: ${sources.length}`);
  console.log(`Eligible dealers: ${eligible.length} | batch offset: ${offset} | batch limit: ${limit}`);

  const result = await crawlInventory(sources);

  for (const source of result.sources) {
    console.log(
      `${source.sourceName}: ${source.pagesFetched} pages, ${source.rawListings} raw, ${source.normalizedListings} VIN-backed, ${source.ingestedListings} ingested`,
    );
    for (const skipped of source.skipped.slice(0, 10)) {
      console.warn(`- ${skipped}`);
    }
    if (source.skipped.length > 10) {
      console.warn(`- ${source.skipped.length - 10} more skipped`);
    }
  }

  console.log("Crawl summary:");
  console.log(JSON.stringify(result.totals, null, 2));
}

function buildInventoryUrls(website: string) {
  const origin = originFromUrl(website);
  if (!origin) return [website];

  return Array.from(
    new Set([
      website,
      `${origin}/inventory`,
      `${origin}/used-inventory/`,
      `${origin}/pre-owned-inventory/`,
      `${origin}/preowned-inventory/`,
      `${origin}/pre-owned/`,
      `${origin}/used-vehicles/`,
      `${origin}/cars-for-sale`,
      `${origin}/searchused.aspx`,
      `${origin}/all-inventory/index.htm`,
      ...Array.from(allowedMakes).flatMap((make) => [
        `${origin}/inventory?make=${encodeURIComponent(make)}`,
        `${origin}/used-inventory/index.htm?make=${encodeURIComponent(make)}`,
      ]),
    ]),
  );
}

function originFromUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLikelyFixtureContact(name?: string | null, website?: string | null, email?: string | null) {
  return /\b(test|demo|dummy|sprint|admin ops|transaction center|supercars 9b)\b/i.test(
    [name, website, email].filter(Boolean).join(" "),
  ) || /example\.(org|test|com)|\.local|localhost|127\.0\.0\.1/i.test(
    [website, email].filter(Boolean).join(" "),
  );
}

main()
  .catch((error) => {
    console.error("Directory dealer inventory crawl failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
