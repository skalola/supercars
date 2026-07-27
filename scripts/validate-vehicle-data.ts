import { prisma } from "../lib/prisma";
import { decodeVin } from "../lib/market-crawlers/crawler-engine";
import {
  normalizeModelName,
  isModelMatch,
  getFreshnessStatus,
  getSourceConfidence,
  resolveInventoryStatus,
  classifyVinIdentityConflict,
} from "../lib/data-quality/inventory-validator";
import { validateVinIdentity, isInvalidVin } from "../lib/data-quality/vin-validator";
import { validateMileage } from "../lib/data-quality/mileage-validator";
import { validatePrice } from "../lib/data-quality/pricing-validator";
import { validateImage } from "../lib/data-quality/image-validator";

async function main() {
  console.log("Starting Vehicle Data Quality & Validation run...");

  const vehicles = await prisma.vehicle.findMany({
    include: {
      model: { include: { make: true } },
      profile: true,
      listings: { include: { source: true } },
      images: true,
    }
  });

  // Track issues for the report
  const duplicateVinsList: { vin: string; ids: string[]; recommendation: string }[] = [];
  let totalVinIssues = 0;
  let missingMileageCount = 0;
  let mileageConflictCount = 0;
  let identityConflictCount = 0;
  let invalidPricingCount = 0;
  let imageIssuesCount = 0;
  let staleListingsCount = 0;

  const affectedVins = new Set<string>();

  // 1. VIN Integrity: Detect and Merge Duplicates
  const vinGroups = new Map<string, string[]>();
  for (const v of vehicles) {
    if (!vinGroups.has(v.vin)) {
      vinGroups.set(v.vin, []);
    }
    vinGroups.get(v.vin)!.push(v.id);
  }

  for (const [vin, ids] of vinGroups.entries()) {
    if (ids.length > 1) {
      totalVinIssues++;
      affectedVins.add(vin);
      const canonicalId = ids[0]; // Keep oldest
      const duplicateIds = ids.slice(1);
      duplicateVinsList.push({
        vin,
        ids,
        recommendation: `Merge duplicates (${duplicateIds.join(", ")}) into canonical vehicle (${canonicalId})`
      });

      console.log(`[VIN Duplication] Merging duplicates for VIN: ${vin}`);
      // Perform safe merge of duplicate vehicles
      for (const dupId of duplicateIds) {
        const dupVehicle = vehicles.find(v => v.id === dupId);
        const canonicalVehicle = vehicles.find(v => v.id === canonicalId);

        if (!dupVehicle || !canonicalVehicle) continue;

        // Merge owner id if missing
        if (!canonicalVehicle.ownerId && dupVehicle.ownerId) {
          await prisma.vehicle.update({
            where: { id: canonicalId },
            data: { ownerId: dupVehicle.ownerId, status: "CLAIMED" }
          });
        }

        // Update VehicleImage relations
        await prisma.vehicleImage.updateMany({
          where: { vehicleId: dupId },
          data: { vehicleId: canonicalId }
        });

        // Merge profiles
        const dupProfile = await prisma.vehicleProfile.findUnique({ where: { vehicleId: dupId } });
        if (dupProfile) {
          const canonicalProfile = await prisma.vehicleProfile.findUnique({ where: { vehicleId: canonicalId } });
          if (!canonicalProfile) {
            await prisma.vehicleProfile.update({
              where: { id: dupProfile.id },
              data: { vehicleId: canonicalId }
            });
          } else {
            // merge ownerNotes or colors
            await prisma.vehicleProfile.update({
              where: { id: canonicalProfile.id },
              data: {
                ownerNotes: `${canonicalProfile.ownerNotes || ""} ${dupProfile.ownerNotes || ""}`.trim() || null
              }
            });
            await prisma.vehicleProfile.delete({ where: { id: dupProfile.id } });
          }
        }

        // Update other references
        await prisma.vehicleModification.updateMany({ where: { vehicleId: dupId }, data: { vehicleId: canonicalId } });
        await prisma.serviceRecord.updateMany({ where: { vehicleId: dupId }, data: { vehicleId: canonicalId } });
        await prisma.vehicleAward.updateMany({ where: { vehicleId: dupId }, data: { vehicleId: canonicalId } });
        await prisma.vehiclePhoto.updateMany({ where: { vehicleId: dupId }, data: { vehicleId: canonicalId } });
        await prisma.vehicleDocument.updateMany({ where: { vehicleId: dupId }, data: { vehicleId: canonicalId } });
        await prisma.listing.updateMany({ where: { vehicleId: dupId }, data: { vehicleId: canonicalId } });

        // Update VinDiscovery
        const dupDiscovery = await prisma.vinDiscovery.findUnique({ where: { vehicleId: dupId } });
        if (dupDiscovery) {
          const canonicalDiscovery = await prisma.vinDiscovery.findUnique({ where: { vehicleId: canonicalId } });
          if (!canonicalDiscovery) {
            await prisma.vinDiscovery.update({
              where: { id: dupDiscovery.id },
              data: { vehicleId: canonicalId }
            });
          } else {
            await prisma.vinDiscoverySource.updateMany({
              where: { discoveryId: dupDiscovery.id },
              data: { discoveryId: canonicalDiscovery.id }
            });
            await prisma.vinDiscovery.delete({ where: { id: dupDiscovery.id } });
          }
        }

        // Keep duplicate vehicle record but update its VIN and status to REMOVED to satisfy unique constraint and preserve history
        await prisma.vehicle.update({
          where: { id: dupId },
          data: {
            vin: `${vin}-DUP-${dupId.substring(0, 8)}`,
            inventoryStatus: "REMOVED"
          }
        });
      }
    }
  }

  // Refetch vehicles after merges to continue clean checks
  const cleanVehicles = await prisma.vehicle.findMany({
    include: {
      model: { include: { make: true } },
      profile: true,
      listings: { include: { source: true } },
      images: true,
    }
  });

  // All models for mapping corrections
  const allModels = await prisma.model.findMany({
    include: { make: true }
  });

  for (const vehicle of cleanVehicles) {
    const vin = vehicle.vin;

    // 2. Mileage Validation & Backfill
    const currentMil = vehicle.profile?.currentMileage ?? vehicle.mileage ?? null;
    const sourceMileages = vehicle.listings.map(l => l.mileage);
    const milResult = validateMileage(currentMil, sourceMileages);

    let finalMileage = vehicle.mileage;
    let mileageStatus = milResult.status;

    if (milResult.status === "MISSING_MILEAGE") {
      missingMileageCount++;
      affectedVins.add(vin);
      // Auto-backfill from active listings if reliable
      const validSourceMils = sourceMileages.filter((m): m is number => m !== null && m >= 0);
      if (validSourceMils.length > 0) {
        finalMileage = Math.max(...validSourceMils);
        mileageStatus = "COMPLETE";
        console.log(`[Mileage Backfill] Backfilling ${finalMileage} miles for VIN: ${vin}`);
      }
    } else if (milResult.status === "MILEAGE_CONFLICT") {
      mileageConflictCount++;
      affectedVins.add(vin);
    }

    // 3. VIN Identity Validation
    const makeName = vehicle.model.make.name;
    const modelName = vehicle.model.name;
    const modelYear = vehicle.year;

    const identityResult = await validateVinIdentity(vin, makeName, modelName, modelYear);
    let finalModelId = vehicle.modelId;
    let finalYear = vehicle.year;
    let vinIdentityStatus = identityResult.status;
    let vinIdentityClassification: string | undefined = undefined;

    if (identityResult.status !== "VALID") {
      // Classify the conflict type using improved normalization rules
      if (identityResult.decodedMake && identityResult.decodedModel && identityResult.decodedYear) {
        // Use source listing make/model for richer classification signal
        const sourceListing = vehicle.listings[0];
        const sourceMake = sourceListing?.dealerName ?? makeName;
        const sourceModel = (sourceListing as any)?.model ?? modelName;

        vinIdentityClassification = classifyVinIdentityConflict({
          dbMake: makeName,
          dbModel: modelName,
          dbYear: modelYear,
          decodedMake: identityResult.decodedMake,
          decodedModel: identityResult.decodedModel,
          decodedYear: identityResult.decodedYear,
          sourceMake: makeName,
          sourceModel: modelName,
        });
      }

      // Only count as a true conflict if classification is not a naming/trim variation
      const isTrueConflict = vinIdentityClassification === "TRUE_IDENTITY_CONFLICT" ||
        vinIdentityClassification === "MAKE_CONFLICT" ||
        vinIdentityClassification === "YEAR_CONFLICT";

      if (isTrueConflict) {
        identityConflictCount++;
        affectedVins.add(vin);
      }

      // VIN wins - correct model relationship and year
      if (identityResult.decodedYear) {
        finalYear = identityResult.decodedYear;
      }

      if (identityResult.decodedModel && identityResult.decodedMake) {
        // Resolve model using normalized mapping rules
        const matchedModel = allModels.find(m =>
          m.make.name.toLowerCase().trim() === identityResult.decodedMake!.toLowerCase().trim() &&
          isModelMatch(m.name, m.slug, identityResult.decodedModel!)
        );
        if (matchedModel) {
          finalModelId = matchedModel.id;
          // Mark as VALID if it's a naming/trim variation that resolved correctly
          if (!isTrueConflict) {
            vinIdentityStatus = "VALID";
          }
          console.log(`[Identity Correction] Mapping vehicle VIN ${vin} to correct model ${matchedModel.make.name} ${matchedModel.name} [${vinIdentityClassification ?? "RESOLVED"}]`);
        } else if (isTrueConflict) {
          console.warn(`[Identity Conflict] VIN ${vin}: ${vinIdentityClassification} — stored: ${makeName} ${modelName}, decoded: ${identityResult.decodedMake} ${identityResult.decodedModel}`);
        }
      }
    }

    // 4. Image Validation Status
    let imageValidationStatus = "VALID_IMAGE";
    for (const img of vehicle.images) {
      const imgStatus = validateImage(img.url, img.validationStatus);
      if (imgStatus !== "VALID_IMAGE") {
        imageValidationStatus = imgStatus;
        imageIssuesCount++;
        affectedVins.add(vin);
      }
    }

    // 5. Listing validations (run before vehicle updates to capture priceStatus)
    let hasInvalidPrice = false;
    for (const listing of vehicle.listings) {
      // Pricing Checks
      const priceResult = validatePrice(listing.price);
      if (priceResult.status === "PRICE_INVALID") {
        invalidPricingCount++;
        affectedVins.add(vin);
        hasInvalidPrice = true;
      }

      // Freshness status tracking
      const freshnessStatus = getFreshnessStatus(listing.status, listing.lastSeen);
      if (freshnessStatus === "STALE") {
        staleListingsCount++;
        affectedVins.add(vin);
      }

      // Source confidence metadata
      const sourceConfidence = getSourceConfidence(listing.source?.type ?? null);

      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          priceStatus: priceResult.status,
          freshnessStatus,
          sourceConfidence
        }
      });
    }

    const priceStatus = hasInvalidPrice ? "PRICE_INVALID" : "VALID_PRICE";

    // Resolve final inventory status with classification-aware logic
    const isDuplicate = cleanVehicles.filter(v => v.vin === vehicle.vin).length > 1;
    const finalStatus = resolveInventoryStatus({
      isDuplicate,
      isInvalidVin: isInvalidVin(vehicle.vin),
      vinIdentityStatus,
      vinIdentityClassification,
      mileageStatus,
      imageValidationStatus,
      priceStatus
    });

    // Update vehicle row
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        mileage: finalMileage,
        modelId: finalModelId,
        year: finalYear,
        mileageStatus,
        vinIdentityStatus,
        imageValidationStatus,
        inventoryStatus: finalStatus,
        // Store classification for reporting and auditing
        ...(vinIdentityClassification ? { vinIdentityClassification } : {})
      }
    });
  }

  // Print final summary report
  console.log("\n==================================================");
  console.log("Vehicle Data Quality Report");
  console.log(`Total Vehicles:     ${cleanVehicles.length}`);
  console.log(`VIN Issues:         ${totalVinIssues}`);
  console.log(`Duplicate VINs:     ${duplicateVinsList.length}`);
  console.log(`Missing Mileage:    ${missingMileageCount}`);
  console.log(`Mileage Conflicts:  ${mileageConflictCount}`);
  console.log(`Identity Conflicts: ${identityConflictCount}`);
  console.log(`Invalid Pricing:    ${invalidPricingCount}`);
  console.log(`Image Issues:       ${imageIssuesCount}`);
  console.log(`Stale Listings:     ${staleListingsCount}`);
  console.log("==================================================");

  if (duplicateVinsList.length > 0) {
    console.log("\nDuplicate VIN details:");
    for (const dup of duplicateVinsList) {
      console.log(`- VIN: ${dup.vin} | IDs: [${dup.ids.join(", ")}] | action: ${dup.recommendation}`);
    }
  }

  if (affectedVins.size > 0) {
    console.log(`\nAffected VINs: [${Array.from(affectedVins).join(", ")}]`);
  }
  console.log("==================================================");
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
