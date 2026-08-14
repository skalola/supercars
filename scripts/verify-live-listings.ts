import { prisma } from "@/lib/prisma";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";
import { getBatchLimit, isExecuteMode, logScriptMode } from "./lib/script-guards";

type ListingCandidate = {
  id: string;
  url: string | null;
  dealerName: string | null;
  source: { name: string; type: string } | null;
  vehicle: {
    vin: string;
    model: {
      make: { name: string };
    };
  } | null;
};

type VerificationResult = {
  live: boolean;
  reason: string;
  status?: number;
};

type VerificationContext = {
  nonTargetMakeNames: string[];
};

const SOLD_OR_GONE_PATTERNS = [
  /this vehicle is no longer available/i,
  /this listing is no longer available/i,
  /vehicle has been sold/i,
  /vehicle sold/i,
  /listing sold/i,
  /page not found/i,
  /404/i,
];

const VEHICLE_LISTING_PATH_PATTERNS = [
  /\/inventory\//i,
  /\/listing\//i,
  /\/vehicle\//i,
  /vehicle-details/i,
  /\/used-/i,
  /\/car\//i,
];

const TARGET_MAKES = new Set<string>(SUPPORTED_MAKES);
const BLOCKED_NON_TARGET_MAKE_SIGNALS = [
  "acura",
  "aston-martin",
  "audi",
  "bentley",
  "bmw",
  "bugatti",
  "cadillac",
  "chevrolet",
  "dodge",
  "ford",
  "jaguar",
  "land-rover",
  "lexus",
  "maserati",
  "mercedes-benz",
  "porsche",
  "range-rover",
  "rolls-royce",
  "toyota",
];

const USER_AGENT =
  "SUPERCAR-DASH-InventoryVerifier/1.0 (+https://supercardash.vercel.app)";

function isVehicleSpecificUrl(url: string, vin: string) {
  const normalizedUrl = url.toUpperCase();
  if (normalizedUrl.includes(vin.toUpperCase())) return true;
  return VEHICLE_LISTING_PATH_PATTERNS.some((pattern) => pattern.test(url));
}

function toUrlSignal(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function hasNonTargetMakeSignal(url: string, makeNames: string[]) {
  const normalizedUrl = url.toLowerCase();
  const compactUrl = normalizedUrl.replace(/[^a-z0-9]+/g, "");
  const signals = [...makeNames.map(toUrlSignal), ...BLOCKED_NON_TARGET_MAKE_SIGNALS];

  return signals.some((urlSignal) => {
    if (!urlSignal || urlSignal.length < 3) return false;
    const compactSignal = urlSignal.replace(/[^a-z0-9]+/g, "");
    return normalizedUrl.includes(urlSignal) || compactUrl.includes(compactSignal);
  });
}

async function fetchListingUrl(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("text") || contentType.includes("html")
    ? await response.text()
    : "";

  return {
    status: response.status,
    ok: response.ok,
    finalUrl: response.url || url,
    body: body.slice(0, 400_000),
  };
}

async function verifyListing(
  candidate: ListingCandidate,
  context: VerificationContext,
): Promise<VerificationResult> {
  const vin = candidate.vehicle?.vin;
  if (!vin) return { live: false, reason: "missing_vin" };
  const make = candidate.vehicle?.model.make.name;
  if (!make || !TARGET_MAKES.has(make)) return { live: false, reason: "non_target_make" };
  if (!candidate.url) return { live: false, reason: "missing_url" };
  if (candidate.source?.type === "AUCTION" || /(^|\.)bringatrailer\.com\//i.test(candidate.url)) {
    return { live: false, reason: "auction_source_not_live_inventory" };
  }
  if (hasNonTargetMakeSignal(candidate.url, context.nonTargetMakeNames)) {
    return { live: false, reason: "non_target_make_url" };
  }
  if (!isVehicleSpecificUrl(candidate.url, vin)) return { live: false, reason: "generic_or_non_vehicle_url" };

  try {
    const response = await fetchListingUrl(candidate.url);

    if ([404, 410, 451].includes(response.status)) {
      return { live: false, status: response.status, reason: "hard_not_found" };
    }

    if (!response.ok) {
      return { live: true, status: response.status, reason: "unverifiable_http_status_kept" };
    }

    const normalizedBody = response.body.replace(/\s+/g, " ");
    const vinVisible = normalizedBody.toUpperCase().includes(vin.toUpperCase());
    const soldOrGone = SOLD_OR_GONE_PATTERNS.some((pattern) => pattern.test(normalizedBody));

    if (soldOrGone && !vinVisible) {
      return { live: false, status: response.status, reason: "sold_or_unavailable_page" };
    }

    if (!vinVisible && !isVehicleSpecificUrl(response.finalUrl, vin)) {
      return { live: false, status: response.status, reason: "verified_page_not_vehicle_specific" };
    }

    return {
      live: true,
      status: response.status,
      reason: vinVisible ? "vin_visible_on_page" : "vehicle_specific_url_live",
    };
  } catch (error) {
    return {
      live: true,
      reason: `network_unverifiable_kept:${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function applyBadListingActions(listingIds: string[]) {
  const actions = new Map<string, "marked_removed" | "deleted">();
  if (listingIds.length === 0) return actions;

  const protectedListings = await prisma.listing.findMany({
    where: {
      id: { in: listingIds },
      OR: [
        { purchases: { some: {} } },
        { fulfillmentRequests: { some: {} } },
      ],
    },
    select: { id: true },
  });
  const protectedIds = new Set(protectedListings.map((listing) => listing.id));
  const removableIds = listingIds.filter((id) => !protectedIds.has(id));

  await prisma.$transaction([
    prisma.listing.updateMany({
      where: { id: { in: Array.from(protectedIds) } },
      data: {
        status: "REMOVED",
        freshnessStatus: "REMOVED",
        validationStatus: "SOURCE_UNAVAILABLE",
      },
    }),
    prisma.listing.deleteMany({
      where: { id: { in: removableIds } },
    }),
  ]);

  for (const id of protectedIds) actions.set(id, "marked_removed");
  for (const id of removableIds) actions.set(id, "deleted");
  return actions;
}

async function main() {
  const execute = isExecuteMode();
  const limit = getBatchLimit({ defaultLimit: 150, maxLimit: 500 });
  logScriptMode("verify-live-listings", execute, limit);

  const nonTargetMakeNames = (
    await prisma.make.findMany({
      where: { name: { notIn: Array.from(TARGET_MAKES) } },
      select: { name: true },
    })
  ).map((make) => make.name);

  const candidates = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      vehicleId: { not: null },
      OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
    },
    select: {
      id: true,
      url: true,
      dealerName: true,
      source: { select: { name: true, type: true } },
      vehicle: {
        select: {
          vin: true,
          model: {
            select: {
              make: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  const results: Array<{
    id: string;
    vin: string | null;
    url: string | null;
    source: string | null;
    live: boolean;
    reason: string;
    action: string;
  }> = [];

  for (const candidate of candidates) {
    const result = await verifyListing(candidate, { nonTargetMakeNames });

    results.push({
      id: candidate.id,
      vin: candidate.vehicle?.vin || null,
      url: candidate.url,
      source: candidate.source?.name || candidate.dealerName,
      live: result.live,
      reason: result.reason,
      action: result.live ? "kept" : "would_remove",
    });
  }

  if (execute) {
    const actions = await applyBadListingActions(
      results.filter((row) => !row.live).map((row) => row.id),
    );
    for (const row of results) {
      if (!row.live) row.action = actions.get(row.id) ?? "would_remove";
    }
  }

  for (const row of results) {
    console.log(`${row.action.toUpperCase()} ${row.vin || "NO_VIN"} ${row.reason} ${row.url || ""}`);
  }

  const summary = results.reduce(
    (acc, row) => {
      acc.checked++;
      if (row.live) acc.live++;
      else acc.notLive++;
      acc.actions[row.action] = (acc.actions[row.action] || 0) + 1;
      return acc;
    },
    { checked: 0, live: 0, notLive: 0, actions: {} as Record<string, number> },
  );

  console.log(JSON.stringify({ execute, ...summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
