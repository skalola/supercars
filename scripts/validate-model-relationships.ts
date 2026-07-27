import { prisma } from "../lib/prisma";
import { decodeVin } from "../lib/market-crawlers/crawler-engine";
import { resolveModel } from "../lib/market-sources/model-matcher";

async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  console.log("=== Starting Inventory Model Relationship Integrity Check (Sprint 6.13) ===");

  // 1. Find Orphan Listings (where vehicleId is null or vehicle doesn't exist)
  const allListings = await prisma.listing.findMany({
    where: { status: "ACTIVE" },
    include: { vehicle: true },
  });

  const orphans = allListings.filter((l) => !l.vehicleId || !l.vehicle);
  console.log(`- Total active listings checked: ${allListings.length}`);
  console.log(`- Orphan listings identified:    ${orphans.length}`);

  for (const orphan of orphans) {
    console.warn(`  [ORPHAN] Listing ID: ${orphan.id} | External ID: ${orphan.externalListingId} has no vehicle relation.`);
  }

  // 2. Find and Validate Unique Vehicles associated with active listings
  const activeListingsWithVehicles = allListings.filter((l) => l.vehicleId && l.vehicle);
  
  // Extract unique vehicles
  const vehiclesMap = new Map<string, any>();
  for (const l of activeListingsWithVehicles) {
    if (l.vehicle && !vehiclesMap.has(l.vehicle.id)) {
      // Fetch full vehicle info including model details
      const fullVehicle = await prisma.vehicle.findUnique({
        where: { id: l.vehicle.id },
        include: {
          model: {
            include: { make: true },
          },
        },
      });
      if (fullVehicle) {
        vehiclesMap.set(l.vehicle.id, fullVehicle);
      }
    }
  }

  const uniqueVehicles = Array.from(vehiclesMap.values());
  console.log(`- Unique active vehicles to validate: ${uniqueVehicles.length}`);

  let mismatchedVehiclesCount = 0;
  let repairedVehiclesCount = 0;
  const affectedVins: string[] = [];

  // Batch process VIN decoding to prevent rate limits and timeouts (batch of 40)
  const validationResults = await batchProcess(uniqueVehicles, 40, async (vehicle) => {
    try {
      const decoded = await decodeVin(vehicle.vin);
      return { vehicle, decoded };
    } catch (e: any) {
      console.error(`  [ERROR] Failed decoding VIN ${vehicle.vin}:`, e.message);
      return { vehicle, decoded: null };
    }
  });

  for (const { vehicle, decoded } of validationResults) {
    if (!decoded || !decoded.make || !decoded.model || !decoded.year) {
      continue;
    }

    const decodedMake = String(decoded.make).trim().toLowerCase();
    const decodedModel = String(decoded.model).trim().toLowerCase();
    const decodedYear = Number(decoded.year);

    const currentMake = vehicle.model.make.name.trim().toLowerCase();
    const currentModel = vehicle.model.name.trim().toLowerCase();
    const currentYear = vehicle.year;

    const makeMatch = decodedMake.includes(currentMake) || currentMake.includes(decodedMake);
    const modelMatch = decodedModel.includes(currentModel) || currentModel.includes(decodedModel);
    const yearMatch = decodedYear === currentYear;

    if (!makeMatch || !modelMatch || !yearMatch) {
      mismatchedVehiclesCount++;
      affectedVins.push(vehicle.vin);
      
      console.warn(
        `\n[MISMATCH DETECTED] VIN: ${vehicle.vin}` +
        `\n  Current: ${currentYear} ${vehicle.model.make.name} ${vehicle.model.name}` +
        `\n  Decoded: ${decodedYear} ${decoded.make} ${decoded.model}`
      );

      // AUTO REPAIR: Find correct model in database
      const correctMakeFormatted = decoded.make.charAt(0).toUpperCase() + decoded.make.slice(1).toLowerCase();
      const modelMatchResult = await resolveModel(correctMakeFormatted, decoded.model);

      if (modelMatchResult.matched && modelMatchResult.modelId) {
        console.log(`  [REPAIR] Correct model found: ${correctMakeFormatted} ${decoded.model} (ID: ${modelMatchResult.modelId})`);
        
        // 1. Update Vehicle model and year
        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: {
            modelId: modelMatchResult.modelId,
            year: decodedYear,
          },
        });

        // 2. Reassign related listings
        const updatedListings = await prisma.listing.updateMany({
          where: { vehicleId: vehicle.id },
          data: {
            modelId: modelMatchResult.modelId,
            year: decodedYear,
            vinVerified: true,
            validationStatus: "MODEL_MISMATCH",
          },
        });

        // 3. Mark vehicle images as IMAGE_UNVERIFIED
        await prisma.vehicleImage.updateMany({
          where: { vehicleId: vehicle.id },
          data: {
            validationStatus: "IMAGE_UNVERIFIED",
          },
        });

        repairedVehiclesCount++;
        console.log(`  [REPAIR SUCCESS] Updated vehicle & reassigned ${updatedListings.count} listings.`);
      } else {
        console.error(`  [REPAIR FAILED] Could not resolve correct model in DB for: ${correctMakeFormatted} ${decoded.model}`);
      }
    }
  }

  console.log("\n=== Validation & Cleanup Summary ===");
  console.log(`- Mismatched vehicles found:  ${mismatchedVehiclesCount}`);
  console.log(`- Auto-repaired successfully: ${repairedVehiclesCount}`);
  console.log(`- Affected VINs:              ${affectedVins.length > 0 ? affectedVins.join(", ") : "None"}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
