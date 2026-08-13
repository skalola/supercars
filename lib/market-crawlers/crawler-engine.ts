import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveModel } from "@/lib/market-sources/model-matcher";
import { upsertPartnerContact } from "@/lib/fulfillment/partner-registry";
import { buildSalesEmailForWebsite } from "@/lib/directory/contact-domain-policy";
import { notifySavedCarNewListing, notifySavedCarPriceDrop } from "@/lib/garage/saved-car-alerts";
import { normalizeSupportedMake, type SupportedMake } from "@/lib/supported-makes";
import { defaultInventorySources } from "./sources";
import type {
  CrawlerSourceResult,
  InventoryCrawlResult,
  NormalizedCrawlerListing,
  PublicInventorySource,
} from "./types";

type IngestCounters = {
  createdVehicles: number;
  updatedVehicles: number;
  unchangedVehicles: number;
  createdListings: number;
  updatedListings: number;
  skipped: string[];
};

type DecodedVinValues = Record<string, string | number | null | undefined>;

type VpicDecodeResponse = {
  Results?: Array<Record<string, string | undefined>>;
};

type CachedSource = { id: string };
type VehicleImageState = "NONE" | "UNVERIFIED" | "VALID";
type VehicleImageStateRow = { vehicleId: string; hasValidImage: boolean };

const crawlerVehicleStateSelect = {
  id: true,
  vin: true,
  trim: true,
  series: true,
  manufacturer: true,
  destinationMarket: true,
  color: true,
  mileage: true,
  bodyStyle: true,
  vehicleType: true,
  doors: true,
  fuelType: true,
  engine: true,
  engineConfiguration: true,
  engineCylinders: true,
  displacement: true,
  turbo: true,
  transmission: true,
  transmissionSpeeds: true,
  drivetrain: true,
  engineHP: true,
  engineKW: true,
  engineManufacturer: true,
  plantCountry: true,
  plantCity: true,
  plantState: true,
  abs: true,
  esc: true,
  tpms: true,
  rearVisibilitySystem: true,
  parkAssist: true,
  adaptiveDrivingBeam: true,
  airBagLocFront: true,
  airBagLocKnee: true,
  airBagLocSide: true,
  pretensioner: true,
  seatBeltsAll: true,
  gvwr: true,
  brakeSystem: true,
  electrificationLevel: true,
} satisfies Prisma.VehicleSelect;

type CrawlerVehicleState = Prisma.VehicleGetPayload<{
  select: typeof crawlerVehicleStateSelect;
}>;
type MutableCrawlerVehicleValues = Partial<Omit<CrawlerVehicleState, "id" | "vin">>;

const decodedVehicleKeys = [
  "transmission",
  "drivetrain",
  "engine",
  "bodyStyle",
  "fuelType",
  "manufacturer",
  "plantCountry",
  "trim",
  "series",
  "vehicleType",
  "doors",
  "engineConfiguration",
  "engineCylinders",
  "displacement",
  "turbo",
  "transmissionSpeeds",
  "plantCity",
  "gvwr",
  "brakeSystem",
  "electrificationLevel",
  "destinationMarket",
  "engineHP",
  "engineKW",
  "engineManufacturer",
  "plantState",
  "abs",
  "esc",
  "tpms",
  "rearVisibilitySystem",
  "parkAssist",
  "adaptiveDrivingBeam",
  "airBagLocFront",
  "airBagLocKnee",
  "airBagLocSide",
  "pretensioner",
  "seatBeltsAll",
] as const satisfies readonly (keyof MutableCrawlerVehicleValues)[];

const sourceCache = new Map<string, Promise<CachedSource>>();
const vinDecodeCache = new Map<string, Promise<DecodedVinValues>>();

function getOrCreateSource(listing: NormalizedCrawlerListing) {
  const cacheKey = `${listing.sourceName}:${listing.sourceType}`;
  const cached = sourceCache.get(cacheKey);
  if (cached) return cached;

  const sourceWebsite = getCrawlerSourceWebsite(listing);
  const source = prisma.marketSource.upsert({
    where: { name: listing.sourceName },
    update: {
      type: listing.sourceType,
      website: sourceWebsite || undefined,
      active: true,
    },
    create: {
      name: listing.sourceName,
      type: listing.sourceType,
      website: sourceWebsite || undefined,
      active: true,
    },
    select: { id: true },
  });
  sourceCache.set(cacheKey, source);
  return source;
}

function getDecodedVin(vin: string) {
  const cached = vinDecodeCache.get(vin);
  if (cached) return cached;
  const decoded = decodeVin(vin);
  vinDecodeCache.set(vin, decoded);
  return decoded;
}

export async function crawlInventory(
  sources: PublicInventorySource[] = defaultInventorySources()
): Promise<InventoryCrawlResult> {
  const startedAt = new Date();
  const sourceResults: CrawlerSourceResult[] = [];
  const totals = {
    pagesFetched: 0,
    normalizedListings: 0,
    createdVehicles: 0,
    updatedVehicles: 0,
    unchangedVehicles: 0,
    createdListings: 0,
    updatedListings: 0,
    skipped: 0,
  };

  for (const source of sources) {
    const sourceStartedAt = new Date();
    const sourceResult: CrawlerSourceResult = {
      sourceName: source.sourceName,
      pagesFetched: 0,
      rawListings: 0,
      normalizedListings: 0,
      ingestedListings: 0,
      skipped: [],
    };

    try {
      const pages = await source.crawlPages();
      sourceResult.pagesFetched = pages.length;

      const rawListings = pages.flatMap((page) => source.extractListings(page));
      sourceResult.rawListings = rawListings.length;

      const normalized = rawListings
        .map((raw) => source.normalizeListing(raw))
        .filter((listing): listing is NormalizedCrawlerListing => Boolean(listing));

      sourceResult.normalizedListings = normalized.length;

      const ingestResult = await ingestCrawlerListings(normalized);
      sourceResult.ingestedListings = ingestResult.createdListings + ingestResult.updatedListings;
      sourceResult.skipped.push(...ingestResult.skipped);

      await deactivateStaleSourceDiscoveries(source.sourceName, sourceStartedAt);

      totals.createdVehicles += ingestResult.createdVehicles;
      totals.updatedVehicles += ingestResult.updatedVehicles;
      totals.unchangedVehicles += ingestResult.unchangedVehicles;
      totals.createdListings += ingestResult.createdListings;
      totals.updatedListings += ingestResult.updatedListings;
    } catch (error) {
      sourceResult.skipped.push(
        `Source failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    totals.pagesFetched += sourceResult.pagesFetched;
    totals.normalizedListings += sourceResult.normalizedListings;
    totals.skipped += sourceResult.skipped.length;
    sourceResults.push(sourceResult);
  }

  await deactivateDiscoveriesWithoutActiveSources();

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    sources: sourceResults,
    totals,
  };
}

export async function ingestCrawlerListings(
  listings: NormalizedCrawlerListing[]
): Promise<IngestCounters> {
  const counters: IngestCounters = {
    createdVehicles: 0,
    updatedVehicles: 0,
    unchangedVehicles: 0,
    createdListings: 0,
    updatedListings: 0,
    skipped: [],
  };

  const seenThisRun = new Set<string>();

  const uniqueListings = listings.filter((listing) => {
    const key = `${listing.sourceName}:${listing.vin}:${listing.url}`;
    if (seenThisRun.has(key)) return false;
    seenThisRun.add(key);
    return true;
  });

  const sourceEntries = await Promise.all(
    Array.from(new Map(uniqueListings.map((listing) => [
      `${listing.sourceName}:${listing.sourceType}`,
      listing,
    ])).entries()).map(async ([key, listing]) => [key, await getOrCreateSource(listing)] as const),
  );
  const sourcesByKey = new Map(sourceEntries);
  const existingVehicles = await prisma.vehicle.findMany({
    where: { vin: { in: Array.from(new Set(uniqueListings.map((listing) => listing.vin))) } },
    select: crawlerVehicleStateSelect,
  });
  const vehiclesByVin = new Map(existingVehicles.map((vehicle) => [vehicle.vin, vehicle]));
  const existingVehicleIds = existingVehicles.map((vehicle) => vehicle.id);
  const existingImageRows = existingVehicleIds.length > 0
    ? await prisma.$queryRaw<VehicleImageStateRow[]>(Prisma.sql`
        SELECT
          image."vehicleId",
          BOOL_OR(image."validationStatus" = 'VALID') AS "hasValidImage"
        FROM "VehicleImage" image
        WHERE image."vehicleId" IN (${Prisma.join(existingVehicleIds)})
        GROUP BY image."vehicleId"
      `)
    : [];
  const imageStateByVehicleId = new Map<string, VehicleImageState>();
  for (const image of existingImageRows) {
    imageStateByVehicleId.set(image.vehicleId, image.hasValidImage ? "VALID" : "UNVERIFIED");
  }

  const sourceIds = Array.from(new Set(sourceEntries.map(([, source]) => source.id)));
  const externalListingIds = Array.from(new Set(uniqueListings.map((listing) => listing.externalListingId)));
  const existingListings = await prisma.listing.findMany({
    where: {
      sourceId: { in: sourceIds },
      externalListingId: { in: externalListingIds },
    },
    select: { id: true, sourceId: true, externalListingId: true, price: true, askingPrice: true },
  });
  const listingsBySourceIdentity = new Map(existingListings.map((listing) => [
    `${listing.sourceId}:${listing.externalListingId}`,
    listing,
  ]));
  const synchronizedPartners = new Set<string>();

  for (const listing of uniqueListings) {
    const decoded = await getDecodedVin(listing.vin);
    let validationStatus = "VALID";

    const decodedMake = decoded.make ? String(decoded.make).trim().toLowerCase() : null;
    const decodedModel = decoded.model ? String(decoded.model).trim().toLowerCase() : null;
    const decodedYear = decoded.year ? Number(decoded.year) : null;

    const listingMake = listing.make ? String(listing.make).trim().toLowerCase() : null;
    const listingModel = listing.model ? String(listing.model).trim().toLowerCase() : null;
    const listingYear = listing.year;

    if (decodedMake && decodedModel && decodedYear && listingMake && listingModel) {
      const makeMatch = decodedMake.includes(listingMake) || listingMake.includes(decodedMake);
      const modelMatchCheck = decodedModel.includes(listingModel) || listingModel.includes(decodedModel);
      const yearMatch = decodedYear === listingYear;

      if (!makeMatch || !modelMatchCheck || !yearMatch) {
        const decodedSupportedMake = normalizeSupportedMake(String(decoded.make));
        if (!decodedSupportedMake) {
          validationStatus = "MODEL_MISMATCH";
        }

        // VIN decode is the source of truth when public page card/context text is noisy.
        if (!decodedSupportedMake) {
          counters.skipped.push(`${listing.vin}: decoded make is not supported`);
          continue;
        }
        listing.make = decodedSupportedMake;
        listing.model = String(decoded.model);
        listing.year = decodedYear;

        console.warn(
          `[VIN Validation] Mismatch for VIN ${listing.vin}: Expected ${listing.year} ${listing.make} ${listing.model} but source had ${listingYear} ${listingMake ?? ""} ${listingModel ?? ""}`
        );
      }
    }

    const modelMatch = await resolveModel(listing.make, listing.model || "");
    if (!modelMatch.matched) {
      counters.skipped.push(`${listing.vin}: ${modelMatch.reason}`);
      continue;
    }

    const source = sourcesByKey.get(`${listing.sourceName}:${listing.sourceType}`)!;

    // Register partner contact. Dealer-owned domains may use the standard sales@domain inbox.
    // Marketplace/reseller pages must remain unresolved until the actual holding dealer is extracted.
    const fallbackDealerEmail = buildSalesEmailForWebsite(listing.dealerWebsite || listing.url);
    const partnerKey = `${listing.dealerName || listing.sourceName}:${getUrlOrigin(listing.dealerWebsite || listing.url) || listing.sourceName}`;
    if (!synchronizedPartners.has(partnerKey) && (listing.sourceType === "DEALER" || listing.dealerWebsite || fallbackDealerEmail)) {
      await upsertPartnerContact({
        name: listing.dealerName || listing.sourceName,
        type: "DEALER",
        website: listing.dealerWebsite || listing.url || undefined,
        location: listing.location || listing.dealerName || undefined,
        makeSpecialization: listing.make as SupportedMake,
        marketSourceId: listing.sourceType === "DEALER" ? source.id : null,
        confidence: "PUBLIC_SOURCE",
        email: fallbackDealerEmail,
      });
      synchronizedPartners.add(partnerKey);
    }

    const existingVehicle = vehiclesByVin.get(listing.vin);
    const incomingVehicleValues = buildCrawlerVehicleValues(listing, decoded);
    let vehicle: Pick<CrawlerVehicleState, "id">;

    if (existingVehicle) {
      const changedValues = getChangedVehicleValues(existingVehicle, incomingVehicleValues);
      if (Object.keys(changedValues).length > 0) {
        const updatedVehicle = await prisma.vehicle.update({
          where: { id: existingVehicle.id },
          data: changedValues,
          select: crawlerVehicleStateSelect,
        });
        vehiclesByVin.set(listing.vin, updatedVehicle);
        vehicle = updatedVehicle;
        counters.updatedVehicles++;
      } else {
        vehicle = existingVehicle;
        counters.unchangedVehicles++;
      }
    } else {
      const createdVehicle = await prisma.vehicle.create({
          data: {
            vin: listing.vin,
            modelId: modelMatch.modelId,
            year: listing.year,
            status: "UNCLAIMED",
            ...incomingVehicleValues,
          },
          select: crawlerVehicleStateSelect,
        });
      vehicle = createdVehicle;
      counters.createdVehicles++;
      vehiclesByVin.set(listing.vin, createdVehicle);
      imageStateByVehicleId.set(vehicle.id, "NONE");
    }

    await attachVehicleImages(
      vehicle.id,
      listing.images,
      validationStatus === "VALID" ? "VALID" : "IMAGE_UNVERIFIED",
      imageStateByVehicleId,
    );
    await upsertVinDiscovery(listing, source.id, vehicle.id);

    const listingIdentity = `${source.id}:${listing.externalListingId}`;
    const previousListing = listingsBySourceIdentity.get(listingIdentity);

    const listingImageUrl = listing.images[0] || null;
    const hasUsablePrice = listing.price !== null && listing.price > 0;
    const hasUsableImage = Boolean(listingImageUrl);
    const listingStatus = hasUsablePrice && hasUsableImage ? "ACTIVE" : "INACTIVE";
    const priceStatus = hasUsablePrice ? "VALID_PRICE" : "PRICE_MISSING";
    const freshnessStatus = hasUsableImage ? "ACTIVE" : "INACTIVE";

    if (!previousListing && listingStatus === "ACTIVE") {
      await prisma.listing.updateMany({
        where: {
          vehicleId: vehicle.id,
          sourceId: source.id,
          status: "ACTIVE",
        },
        data: { status: "REMOVED" },
      });
    }

    const savedListing = await prisma.listing.upsert({
      where: {
        sourceId_externalListingId: {
          sourceId: source.id,
          externalListingId: listing.externalListingId,
        },
      },
      update: {
        modelId: modelMatch.modelId,
        year: listing.year,
        price: listing.price,
        askingPrice: listing.price,
        mileage: listing.mileage,
        color: listing.color,
        location: listing.location,
        dealerName: listing.dealerName,
        url: listing.url,
        imageUrl: listingImageUrl,
        vehicleId: vehicle.id,
        status: listingStatus,
        lastSeen: new Date(),
        vinVerified: decoded.make ? true : false,
        validationStatus,
        priceStatus,
        freshnessStatus,
      },
      create: {
        modelId: modelMatch.modelId,
        sourceId: source.id,
        externalListingId: listing.externalListingId,
        year: listing.year,
        price: listing.price,
        askingPrice: listing.price,
        mileage: listing.mileage,
        color: listing.color,
        location: listing.location,
        dealerName: listing.dealerName,
        url: listing.url,
        imageUrl: listingImageUrl,
        vehicleId: vehicle.id,
        status: listingStatus,
        firstSeen: new Date(),
        lastSeen: new Date(),
        vinVerified: decoded.make ? true : false,
        validationStatus,
        priceStatus,
        freshnessStatus,
      },
      select: {
        id: true,
        price: true,
        askingPrice: true,
      },
    });
    listingsBySourceIdentity.set(listingIdentity, {
      id: savedListing.id,
      sourceId: source.id,
      externalListingId: listing.externalListingId,
      price: savedListing.price,
      askingPrice: savedListing.askingPrice,
    });

    if (previousListing) {
      counters.updatedListings++;
      const previousPrice = previousListing.askingPrice ?? previousListing.price ?? null;
      const currentPrice = listing.price ?? null;
      if (previousPrice && currentPrice && currentPrice < previousPrice) {
        await safelySendSavedCarAlert(() =>
          notifySavedCarPriceDrop(savedListing.id, previousPrice, currentPrice)
        );
      }
    } else {
      counters.createdListings++;
      await safelySendSavedCarAlert(() => notifySavedCarNewListing(savedListing.id));
    }
  }

  return counters;
}

function getCrawlerSourceWebsite(listing: NormalizedCrawlerListing) {
  if (listing.sourceType === "DEALER") {
    return listing.dealerWebsite || getUrlOrigin(listing.url);
  }
  if (/autotrader/i.test(listing.sourceName)) return "https://www.autotrader.com";
  if (/cars\.com|cars/i.test(listing.sourceName)) return "https://www.cars.com";
  if (/dupont/i.test(listing.sourceName)) return "https://www.dupontregistry.com";
  return null;
}

function getUrlOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

async function safelySendSavedCarAlert(send: () => Promise<{ sent: number; skipped?: string }>) {
  try {
    const result = await send();
    if (result.sent > 0) {
      console.log(`[Saved Car Alert] Sent ${result.sent} alert${result.sent === 1 ? "" : "s"}.`);
    }
  } catch (error) {
    console.warn(
      `[Saved Car Alert] Skipped alert dispatch: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function attachVehicleImages(
  vehicleId: string,
  images: string[],
  validationStatus: string,
  imageStateByVehicleId: Map<string, VehicleImageState>,
) {
  const uniqueImages = Array.from(new Set(images.filter(Boolean))).slice(0, 12);
  if (uniqueImages.length === 0) return;

  const currentState = imageStateByVehicleId.get(vehicleId) ?? "NONE";
  if (currentState === "VALID") return;

  if (validationStatus === "VALID") {
    await prisma.vehicleImage.deleteMany({
      where: { vehicleId },
    });
  } else if (currentState !== "NONE") {
    return;
  }

  await prisma.vehicleImage.createMany({
    data: uniqueImages.map((url, index) => ({
        vehicleId,
        url,
        isPrimary: index === 0,
        validationStatus,
      })),
  });
  imageStateByVehicleId.set(
    vehicleId,
    validationStatus === "VALID" ? "VALID" : "UNVERIFIED",
  );
}

async function upsertVinDiscovery(
  listing: NormalizedCrawlerListing,
  sourceId: string,
  vehicleId: string
) {
  const discovery = await prisma.vinDiscovery.upsert({
    where: { vin: listing.vin },
    update: {
      vehicleId,
      lastSeen: new Date(),
      active: true,
    },
    create: {
      vin: listing.vin,
      vehicleId,
      active: true,
    },
    select: { id: true },
  });

  await prisma.vinDiscoverySource.upsert({
    where: {
      discoveryId_sourceKey: {
        discoveryId: discovery.id,
        sourceKey: listing.sourceKey,
      },
    },
    update: {
      sourceId,
      url: listing.url,
      externalListingId: listing.externalListingId,
      lastSeen: new Date(),
      active: true,
    },
    create: {
      discoveryId: discovery.id,
      sourceId,
      sourceName: listing.sourceName,
      sourceKey: listing.sourceKey,
      url: listing.url,
      externalListingId: listing.externalListingId,
      active: true,
    },
    select: { id: true },
  });
}

async function deactivateStaleSourceDiscoveries(sourceName: string, sourceStartedAt: Date) {
  await prisma.vinDiscoverySource.updateMany({
    where: {
      sourceName,
      active: true,
      lastSeen: { lt: sourceStartedAt },
    },
    data: { active: false },
  });

}

async function deactivateDiscoveriesWithoutActiveSources() {
  await prisma.$executeRaw`
    UPDATE "VinDiscovery" discovery
    SET "active" = false, "updatedAt" = NOW()
    WHERE discovery."active" = true
      AND NOT EXISTS (
        SELECT 1
        FROM "VinDiscoverySource" source
        WHERE source."discoveryId" = discovery."id"
          AND source."active" = true
      )
  `;
}

export async function decodeVin(vin: string): Promise<DecodedVinValues> {
  if (process.env.CRAWLER_DISABLE_VIN_DECODE === "1") return {};

  try {
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
    );
    if (!response.ok) return {};

    const data = await response.json() as VpicDecodeResponse;
    const result = data.Results?.[0];
    if (!result || result.ErrorCode === "0;14") return {};

    return {
      transmission: result.TransmissionStyle,
      drivetrain: result.DriveType,
      engine: result.EngineModel,
      bodyStyle: result.BodyClass,
      fuelType: result.FuelTypePrimary,
      manufacturer: result.Manufacturer,
      plantCountry: result.PlantCountry,
      trim: result.Trim,
      series: result.Series,
      vehicleType: result.VehicleType,
      doors: result.Doors,
      engineConfiguration: result.EngineConfiguration,
      engineCylinders: result.EngineCylinders,
      displacement: result.DisplacementL,
      turbo: result.Turbo,
      transmissionSpeeds: result.TransmissionSpeeds,
      plantCity: result.PlantCity,
      gvwr: result.GVWR,
      brakeSystem: result.BrakeSystemType,
      electrificationLevel: result.ElectrificationLevel,
      destinationMarket: result.DestinationMarket,
      engineHP: result.EngineHP,
      engineKW: result.EngineKW,
      engineManufacturer: result.EngineManufacturer,
      plantState: result.PlantState,
      abs: result.ABS,
      esc: result.ESC,
      tpms: result.TPMS,
      rearVisibilitySystem: result.RearVisibilitySystem,
      parkAssist: result.ParkAssist,
      adaptiveDrivingBeam: result.AdaptiveDrivingBeam,
      airBagLocFront: result.AirBagLocFront,
      airBagLocKnee: result.AirBagLocKnee,
      airBagLocSide: result.AirBagLocSide,
      pretensioner: result.Pretensioner,
      seatBeltsAll: result.SeatBeltsAll,
      model: result.Model,
      year: result.ModelYear ? Number(result.ModelYear) : null,
      make: result.Make,
    };
  } catch (error) {
    console.warn(`[VIN Decode] Failed for ${vin}:`, error instanceof Error ? error.message : error);
    return {};
  }
}

function buildCrawlerVehicleValues(
  listing: NormalizedCrawlerListing,
  decoded: DecodedVinValues,
): MutableCrawlerVehicleValues {
  const values: MutableCrawlerVehicleValues = {};
  if (listing.mileage !== null) values.mileage = listing.mileage;
  if (listing.color !== null && listing.color.trim() !== "") values.color = listing.color;
  if (listing.trim !== null && listing.trim.trim() !== "") values.trim = listing.trim;
  return { ...values, ...nonEmptyDecodedValues(decoded) };
}

function getChangedVehicleValues(
  existing: CrawlerVehicleState,
  incoming: MutableCrawlerVehicleValues,
): MutableCrawlerVehicleValues {
  return Object.fromEntries(
    Object.entries(incoming).filter(([key, value]) => (
      existing[key as keyof CrawlerVehicleState] !== value
    )),
  ) as MutableCrawlerVehicleValues;
}

function nonEmptyDecodedValues(decoded: DecodedVinValues): MutableCrawlerVehicleValues {
  return Object.fromEntries(
    decodedVehicleKeys.flatMap((key) => {
      const value = decoded[key];
      return typeof value === "string" && value.trim() !== "" ? [[key, value]] : [];
    }),
  ) as MutableCrawlerVehicleValues;
}
