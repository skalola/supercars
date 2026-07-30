import { prisma } from "@/lib/prisma";
import { buildSalesEmailForWebsite, getHostname } from "@/lib/directory/contact-domain-policy";
import { upsertPartnerContact } from "@/lib/fulfillment/partner-registry";
import { MCLAREN_DEALERS } from "@/lib/market-crawlers/dealer-registry";

type McLarenDealerDirectoryInput = {
  name: string;
  website: string;
  city: string | null;
  state: string | null;
  marketSourceId: string | null;
  listingCount: number;
};

async function main() {
  const inventoryDealers = await getInventoryBackedMcLarenDealers();
  const registryDealers = MCLAREN_DEALERS.map((dealer) => ({
    name: dealer.name,
    website: getOrigin(dealer.inventoryUrl) || getOrigin(dealer.additionalUrls?.[0]) || dealer.inventoryUrl,
    city: dealer.city,
    state: dealer.state,
    marketSourceId: null,
    listingCount: 0,
  }));

  const dealers = mergeDealers([...inventoryDealers, ...registryDealers]);
  const synced = [];
  const skipped = [];

  for (const dealer of dealers) {
    const email = buildSalesEmailForWebsite(dealer.website);
    const sourceDomain = getHostname(dealer.website);

    if (!email || !sourceDomain) {
      skipped.push({ name: dealer.name, website: dealer.website, reason: "missing dealer-owned domain" });
      continue;
    }

    const marketSource = await prisma.marketSource.upsert({
      where: { name: dealer.name },
      update: {
        type: "DEALER",
        website: dealer.website,
        active: true,
      },
      create: {
        name: dealer.name,
        type: "DEALER",
        website: dealer.website,
        active: true,
      },
    });

    const common = {
      email,
      phone: null,
      website: dealer.website,
      sourceDomain,
      makeSpecialization: "McLaren",
      location: formatCityState(dealer.city, dealer.state),
      city: dealer.city,
      state: dealer.state,
      country: "US",
      active: true,
      confidence: "PUBLIC_SOURCE" as const,
      contactSource: "PUBLIC_WEBSITE" as const,
      coverage: "LOCAL" as const,
    };

    const dealerContact = await upsertPartnerContact({
      ...common,
      name: dealer.name,
      type: "DEALER",
      marketSourceId: dealer.marketSourceId || marketSource.id,
    });

    const serviceContact = await upsertPartnerContact({
      ...common,
      name: `${dealer.name} Service`,
      type: "SERVICE_SHOP",
      marketSourceId: null,
    });

    synced.push({
      name: dealer.name,
      email,
      city: dealer.city,
      state: dealer.state,
      listingCount: dealer.listingCount,
      dealerContactId: dealerContact.id,
      serviceContactId: serviceContact.id,
    });
  }

  console.log(JSON.stringify({ synced: synced.length, skipped, dealers: synced }, null, 2));
}

async function getInventoryBackedMcLarenDealers(): Promise<McLarenDealerDirectoryInput[]> {
  const sources = await prisma.marketSource.findMany({
    where: {
      type: "DEALER",
      active: true,
      website: { not: null },
      listings: {
        some: {
          vehicle: {
            is: {
              model: {
                make: { slug: "mclaren" },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      website: true,
      _count: {
        select: { listings: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return sources
    .map((source) => {
      const registryMatch = MCLAREN_DEALERS.find((dealer) => normalizeName(dealer.name) === normalizeName(source.name));
      return {
        name: source.name,
        website: source.website!,
        city: registryMatch?.city ?? inferCityFromDealerName(source.name),
        state: registryMatch?.state ?? inferStateFromDealerName(source.name),
        marketSourceId: source.id,
        listingCount: source._count.listings,
      };
    })
    .filter((dealer) => Boolean(buildSalesEmailForWebsite(dealer.website)));
}

function mergeDealers(dealers: McLarenDealerDirectoryInput[]) {
  const merged = new Map<string, McLarenDealerDirectoryInput>();

  for (const dealer of dealers) {
    const key = normalizeName(dealer.name);
    const existing = merged.get(key);
    if (!existing || dealer.listingCount > existing.listingCount || (!existing.marketSourceId && dealer.marketSourceId)) {
      merged.set(key, {
        ...existing,
        ...dealer,
        city: dealer.city || existing?.city || null,
        state: dealer.state || existing?.state || null,
        listingCount: Math.max(existing?.listingCount ?? 0, dealer.listingCount),
        marketSourceId: dealer.marketSourceId || existing?.marketSourceId || null,
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getOrigin(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function formatCityState(city?: string | null, state?: string | null) {
  return [city, state].filter(Boolean).join(", ") || null;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function inferCityFromDealerName(name: string) {
  return name.replace(/^McLaren\s+/i, "").trim() || null;
}

function inferStateFromDealerName(name: string) {
  const city = inferCityFromDealerName(name)?.toLowerCase();
  const states: Record<string, string> = {
    boston: "MA",
    dallas: "TX",
    houston: "TX",
    philadelphia: "PA",
    "north jersey": "NJ",
    "tampa bay": "FL",
  };

  return city ? states[city] ?? null : null;
}

main()
  .catch((error) => {
    console.error("McLaren directory sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
