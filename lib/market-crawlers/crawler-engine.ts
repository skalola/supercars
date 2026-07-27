import { prisma } from "@/lib/prisma";
import { resolveModel } from "@/lib/market-sources/model-matcher";
import { upsertPartnerContact } from "@/lib/fulfillment/partner-registry";
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
        validationStatus = "MODEL_MISMATCH";

        // Override listing details with VIN decoded values
        listing.make = (decoded.make.charAt(0).toUpperCase() + decoded.make.slice(1).toLowerCase()) as any;
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

    const source = await prisma.marketSource.upsert({
      where: { name: listing.sourceName },
      update: {
        type: listing.sourceType,
        active: true,
      },
      create: {
        name: listing.sourceName,
        type: listing.sourceType,
        active: true,
      },
    });

    // Enforce Sprint 7.2 Partner Contact Registry:
    // Auto-register partner contact. If email is not present from crawler, set email = null and contactStatus = UNRESOLVED_EMAIL.
    // NEVER guess emails.
    await upsertPartnerContact({
      name: listing.sourceName,
      type: listing.sourceType === "DEALER" ? "DEALER" : "DEALER",
      website: listing.url || undefined,
      location: listing.location || listing.dealerName || undefined,
      makeSpecialization: listing.make as "Ferrari" | "Lamborghini",
      marketSourceId: source.id,
      confidence: "PUBLIC_SOURCE",
      email: null, // Crawler listing has no published email -> UNRESOLVED_EMAIL (do not guess!)
    });

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
      select: { id: true },
    });

    if (!previousListing) {
      await prisma.listing.updateMany({
        where: {
          vehicleId: vehicle.id,
          sourceId: source.id,
          status: "ACTIVE",
        },
        data: { status: "REMOVED" },
      });
    }

    await prisma.listing.upsert({
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
        vehicleId: vehicle.id,
        status: "ACTIVE",
        lastSeen: new Date(),
        vinVerified: decoded.make ? true : false,
        validationStatus,
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
        vehicleId: vehicle.id,
        status: "ACTIVE",
        firstSeen: new Date(),
        lastSeen: new Date(),
        vinVerified: decoded.make ? true : false,
        validationStatus,
      },
    });

    if (previousListing) counters.updatedListings++;
    else counters.createdListings++;
  }

  return counters;
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
