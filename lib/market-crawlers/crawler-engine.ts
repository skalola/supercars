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
  createdListings: number;
  updatedListings: number;
  skipped: string[];
};

type DecodedVinValues = Record<string, any>;

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
    createdListings: 0,
    updatedListings: 0,
    skipped: [],
  };

  const seenThisRun = new Set<string>();

  for (const listing of listings) {
    if (seenThisRun.has(`${listing.sourceName}:${listing.vin}:${listing.url}`)) continue;
    seenThisRun.add(`${listing.sourceName}:${listing.vin}:${listing.url}`);

    const decoded = await decodeVin(listing.vin);
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
        const decodedSupportedMake = normalizeSupportedMake(decoded.make);
        if (!decodedSupportedMake) {
          validationStatus = "MODEL_MISMATCH";
        }

        // VIN decode is the source of truth when public page card/context text is noisy.
        listing.make = (
          decodedSupportedMake ??
          (decoded.make.charAt(0).toUpperCase() + decoded.make.slice(1).toLowerCase())
        ) as any;
        listing.model = decoded.model as string;
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

    const sourceWebsite = getCrawlerSourceWebsite(listing);
    const source = await prisma.marketSource.upsert({
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
    });

    // Register partner contact. Dealer-owned domains may use the standard sales@domain inbox.
    // Marketplace/reseller pages must remain unresolved until the actual holding dealer is extracted.
    const fallbackDealerEmail = buildSalesEmailForWebsite(listing.dealerWebsite || listing.url);
    if (listing.sourceType === "DEALER" || listing.dealerWebsite || fallbackDealerEmail) {
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
    }

    const existingVehicle = await prisma.vehicle.findUnique({
      where: { vin: listing.vin },
      select: { id: true },
    });

    const vehicle = existingVehicle
      ? await prisma.vehicle.update({
          where: { vin: listing.vin },
          data: {
            mileage: listing.mileage ?? undefined,
            color: listing.color ?? undefined,
            trim: listing.trim ?? undefined,
            ...nonEmptyDecodedValues(decoded),
          },
          select: { id: true },
        })
      : await prisma.vehicle.create({
          data: {
            vin: listing.vin,
            modelId: modelMatch.modelId,
            year: listing.year,
            status: "UNCLAIMED",
            mileage: listing.mileage,
            color: listing.color,
            trim: listing.trim,
            ...nonEmptyDecodedValues(decoded),
          },
          select: { id: true },
        });

    if (existingVehicle) counters.updatedVehicles++;
    else counters.createdVehicles++;

    await attachVehicleImages(
      vehicle.id,
      listing.images,
      validationStatus === "VALID" ? "VALID" : "IMAGE_UNVERIFIED"
    );
    await upsertVinDiscovery(listing, source.id, vehicle.id);

    const previousListing = await prisma.listing.findUnique({
      where: {
        sourceId_externalListingId: {
          sourceId: source.id,
          externalListingId: listing.externalListingId,
        },
      },
      select: { id: true, price: true, askingPrice: true },
    });

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

async function attachVehicleImages(vehicleId: string, images: string[], validationStatus: string) {
  const uniqueImages = Array.from(new Set(images.filter(Boolean))).slice(0, 12);
  if (uniqueImages.length === 0) return;

  const existingValidCount = await prisma.vehicleImage.count({
    where: { vehicleId, validationStatus: "VALID" },
  });
  if (existingValidCount > 0) return;

  if (validationStatus === "VALID") {
    await prisma.vehicleImage.deleteMany({
      where: { vehicleId },
    });
  } else {
    const existingCount = await prisma.vehicleImage.count({
      where: { vehicleId },
    });
    if (existingCount > 0) return;
  }

  for (const [index, url] of uniqueImages.entries()) {
    await prisma.vehicleImage.create({
      data: {
        vehicleId,
        url,
        isPrimary: index === 0,
        validationStatus,
      },
    });
  }
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

  const activeSources = await prisma.vinDiscoverySource.findMany({
    where: { active: true },
    select: { discoveryId: true },
    distinct: ["discoveryId"],
  });
  const activeDiscoveryIds = activeSources.map((source: { discoveryId: string }) => source.discoveryId);

  await prisma.vinDiscovery.updateMany({
    where: {
      active: true,
      id: activeDiscoveryIds.length > 0 ? { notIn: activeDiscoveryIds } : undefined,
    },
    data: { active: false },
  });
}

export async function decodeVin(vin: string): Promise<DecodedVinValues> {
  if (process.env.CRAWLER_DISABLE_VIN_DECODE === "1") return {};

  try {
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
    );
    if (!response.ok) return {};

    const data = await response.json() as any;
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

function nonEmptyDecodedValues(decoded: DecodedVinValues) {
  const excludeKeys = new Set(["model", "make", "year"]);
  return Object.fromEntries(
    Object.entries(decoded).filter(
      ([key, value]) => !excludeKeys.has(key) && typeof value === "string" && value.trim() !== ""
    )
  );
}
