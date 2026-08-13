import { prisma } from "../lib/prisma";
import { FerrariConnector } from "../lib/market-sources/connectors/ferrari.connector";
import { LamborghiniConnector } from "../lib/market-sources/connectors/lamborghini.connector";
import { NormalizedExternalListing } from "../lib/market-sources/connectors/external-inventory";
import { isValidVin } from "./ingest-bat-inventory";

// Define the available connectors mapped by make
const CONNECTORS: Record<string, any> = {
  Ferrari: FerrariConnector,
  Lamborghini: LamborghiniConnector,
};

async function fetchAndDecodeVin(vin: string): Promise<Record<string, any>> {
  console.log(`- Fetching VIN details from NHTSA for: ${vin}`);
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    if (res.ok) {
      const data = await res.json();
      const results = data.Results?.[0];
      if (results) {
        return {
          transmission: results.TransmissionStyle || null,
          drivetrain: results.DriveType || null,
          engine: results.EngineModel || null,
          bodyStyle: results.BodyClass || null,
          fuelType: results.FuelTypePrimary || null,
          manufacturer: results.Manufacturer || null,
          plantCountry: results.PlantCountry || null,
          trim: results.Trim || null,
          series: results.Series || null,
          vehicleType: results.VehicleType || null,
          doors: results.Doors || null,
          engineConfiguration: results.EngineConfiguration || null,
          engineCylinders: results.EngineCylinders || null,
          displacement: results.DisplacementL || null,
          turbo: results.Turbo || null,
          transmissionSpeeds: results.TransmissionSpeeds || null,
          plantCity: results.PlantCity || null,
          gvwr: results.GVWR || null,
          brakeSystem: results.BrakeSystemType || null,
          electrificationLevel: results.ElectrificationLevel || null,
          destinationMarket: results.DestinationMarket || null,
          engineHP: results.EngineHP || null,
          engineKW: results.EngineKW || null,
          engineManufacturer: results.EngineManufacturer || null,
          plantState: results.PlantState || null,
          abs: results.ABS || null,
          esc: results.ESC || null,
          tpms: results.TPMS || null,
          rearVisibilitySystem: results.RearVisibilitySystem || null,
          parkAssist: results.ParkAssist || null,
          adaptiveDrivingBeam: results.AdaptiveDrivingBeam || null,
          airBagLocFront: results.AirBagLocFront || null,
          airBagLocKnee: results.AirBagLocKnee || null,
          airBagLocSide: results.AirBagLocSide || null,
          pretensioner: results.Pretensioner || null,
          seatBeltsAll: results.SeatBeltsAll || null,
        };
      }
    }
  } catch (e: any) {
    console.warn(`[NHTSA Decode] Fetch failed: ${e.message}. Using fallback.`);
  }
  return {};
}

async function cleanDatabase() {
  console.log("Starting database cleanup for invalid vehicle identifiers...");
  const vehicles = await prisma.vehicle.findMany({
    select: {
      id: true,
      vin: true,
      _count: { select: { listings: true } },
    },
  });

  let deletedVehicles = 0;
  let deletedListingsCount = 0;

  for (const v of vehicles) {
    const vinUpper = v.vin.trim().toUpperCase();
    const startsWithExt = vinUpper.startsWith("EXT-");
    const isInvalid = !isValidVin(vinUpper);

    if (startsWithExt || isInvalid) {
      console.log(`- Removing invalid vehicle from DB: ${v.vin}`);
      
      if (v._count.listings > 0) {
        await prisma.listing.deleteMany({ where: { vehicleId: v.id } });
        deletedListingsCount += v._count.listings;
      }
      await prisma.vehicleImage.deleteMany({ where: { vehicleId: v.id } });
      await prisma.vehiclePhoto.deleteMany({ where: { vehicleId: v.id } });
      await prisma.vehicleProfile.deleteMany({ where: { vehicleId: v.id } });
      await prisma.serviceRecord.deleteMany({ where: { vehicleId: v.id } });
      await prisma.vehicleAward.deleteMany({ where: { vehicleId: v.id } });
      await prisma.vehicleModification.deleteMany({ where: { vehicleId: v.id } });
      await prisma.vehicleDocument.deleteMany({ where: { vehicleId: v.id } });

      await prisma.vehicle.delete({ where: { id: v.id } });
      deletedVehicles++;
    }
  }

  if (deletedVehicles > 0) {
    console.log(`Cleanup complete: Deleted ${deletedVehicles} invalid vehicles and ${deletedListingsCount} listings.\n`);
  } else {
    console.log("Cleanup complete: No invalid vehicles found.\n");
  }
}

async function ingestListings(listings: NormalizedExternalListing[], make: string) {
  let createdVehicles = 0;
  let matchedVehicles = 0;
  let createdListings = 0;
  let updatedListings = 0;
  let skippedListings = 0;

  for (const listing of listings) {
    if (!isValidVin(listing.vin)) {
      console.warn(`[Ingestion] Invalid or missing VIN "${listing.vin}" for listing ID "${listing.externalId}" — SKIPPING`);
      skippedListings++;
      continue;
    }

    const cleanVin = listing.vin!.trim().toUpperCase();

    let sourceRecord = await prisma.marketSource.findUnique({
      where: { name: listing.source },
    });
    if (!sourceRecord) {
      sourceRecord = await prisma.marketSource.create({
        data: {
          name: listing.source,
          type: "MARKETPLACE",
        },
      });
    }

    const makeRecord = await prisma.make.findFirst({
      where: { name: listing.make },
    });
    if (!makeRecord) {
      console.warn(`[Ingestion] Make not found: ${listing.make} — skipping`);
      skippedListings++;
      continue;
    }

    let modelRecord = await prisma.model.findFirst({
      where: {
        makeId: makeRecord.id,
        name: listing.model,
      },
    });
    if (!modelRecord) {
      modelRecord = await prisma.model.findFirst({
        where: {
          makeId: makeRecord.id,
          name: { contains: listing.model },
        },
      });
    }
    if (!modelRecord) {
      const allModels = await prisma.model.findMany({
        where: { makeId: makeRecord.id },
      });
      modelRecord = allModels.find(
        (m) =>
          listing.model.toLowerCase().includes(m.name.toLowerCase()) ||
          m.name.toLowerCase().includes(listing.model.toLowerCase())
      ) || null;
    }

    if (!modelRecord) {
      console.warn(`[Ingestion] Model not resolved: ${listing.make} ${listing.model} — skipping`);
      skippedListings++;
      continue;
    }

    let vehicle = await prisma.vehicle.findUnique({
      where: { vin: cleanVin },
      select: {
        id: true,
        _count: { select: { photos: true, images: true } },
      },
    });

    if (vehicle) {
      matchedVehicles++;
    } else {
      const decodedSpecs = await fetchAndDecodeVin(cleanVin);

      vehicle = await prisma.vehicle.create({
        data: {
          vin: cleanVin,
          modelId: modelRecord.id,
          year: listing.year,
          status: "UNCLAIMED",
          mileage: listing.mileage,
          color: (listing as any).color || null,
          ...decodedSpecs,
        },
        select: {
          id: true,
          _count: { select: { photos: true, images: true } },
        },
      });
      createdVehicles++;
    }

    if (listing.images && listing.images.length > 0) {
      const hasImages = vehicle._count.photos > 0 || vehicle._count.images > 0;
      if (!hasImages) {
        for (let i = 0; i < listing.images.length; i++) {
          await prisma.vehicleImage.create({
            data: {
              vehicleId: vehicle.id,
              url: listing.images[i],
              isPrimary: i === 0,
            },
          });
        }
      }
    }

    const duplicateActive = await prisma.listing.findFirst({
      where: {
        vehicleId: vehicle.id,
        sourceId: sourceRecord.id,
        status: "ACTIVE",
      },
    });

    if (duplicateActive && duplicateActive.externalListingId !== listing.externalId) {
      await prisma.listing.update({
        where: { id: duplicateActive.id },
        data: { status: "REMOVED" },
      });
    }

    const existingListing = await prisma.listing.findUnique({
      where: {
        sourceId_externalListingId: {
          sourceId: sourceRecord.id,
          externalListingId: listing.externalId,
        },
      },
    });

    if (existingListing) {
      await prisma.listing.update({
        where: { id: existingListing.id },
        data: {
          price: listing.price,
          askingPrice: listing.price,
          mileage: listing.mileage,
          dealerName: listing.seller,
          url: listing.url,
          status: "ACTIVE",
          updatedAt: new Date(),
        },
      });
      updatedListings++;
    } else {
      await prisma.listing.create({
        data: {
          modelId: modelRecord.id,
          sourceId: sourceRecord.id,
          externalListingId: listing.externalId,
          year: listing.year,
          price: listing.price,
          askingPrice: listing.price,
          mileage: listing.mileage,
          color: (listing as any).color || null,
          dealerName: listing.seller,
          url: listing.url,
          status: "ACTIVE",
          vehicleId: vehicle.id,
        },
      });
      createdListings++;
    }
  }

  console.log(`\n${make} Ingestion Summary:`);
  console.log(`- Listings Skipped (Invalid VIN):  ${skippedListings}`);
  console.log(`- Vehicles Matched:                ${matchedVehicles}`);
  console.log(`- Vehicles Created:                ${createdVehicles}`);
  console.log(`- Listings Created:                ${createdListings}`);
  console.log(`- Listings Updated:                ${updatedListings}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const makeArg = args.find(a => a.startsWith("--make="))?.split("=")[1];

  if (!makeArg) {
    console.error("❌ Missing required argument: --make");
    console.error("Usage: npx ts-node scripts/ingest-inventory.ts --make=Ferrari (or --make=all)");
    process.exit(1);
  }

  let makesToProcess: string[] = [];

  if (makeArg.toLowerCase() === "all") {
    console.log("Ingesting inventory for ALL configured brands...");
    makesToProcess = Object.keys(CONNECTORS);
  } else {
    const brandKey = Object.keys(CONNECTORS).find(k => k.toLowerCase() === makeArg.toLowerCase());
    if (!brandKey) {
      console.error(`❌ Unsupported make: ${makeArg}`);
      console.error(`Currently supported makes: ${Object.keys(CONNECTORS).join(", ")}`);
      process.exit(1);
    }
    makesToProcess.push(brandKey);
  }

  await cleanDatabase();

  for (const make of makesToProcess) {
    console.log(`\nStarting ${make} inventory ingestion (VIN-First)...`);
    
    const ConnectorClass = CONNECTORS[make];
    const connector = new ConnectorClass();
    
    console.log(`Fetching from source: ${connector.sourceName}...`);
    
    try {
      const listings = await connector.fetchListings();
      console.log(`- Fetched ${listings.length} listings`);
      await ingestListings(listings, make);
    } catch (e: any) {
      console.error(`- Error processing ${make} connector:`, e.message);
      // Don't exit if we're processing multiple makes, just continue
      if (makesToProcess.length === 1) {
        process.exit(1);
      }
    }
    
    console.log(`${make} Ingestion finished successfully.`);
  }
}

main()
  .catch((e) => {
    console.error("Ingestion failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
