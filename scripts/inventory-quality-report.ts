import { prisma } from "../lib/prisma";
import { isInvalidVin } from "../lib/data-quality/vin-validator";

async function main() {
  const vehicles = await prisma.vehicle.findMany({
    include: {
      model: { include: { make: true } },
      listings: { include: { source: true } }
    }
  });

  const totalVehicles = vehicles.length;
  // VALID and WARNING are publicly displayable. NEEDS_REVIEW and REMOVED are hidden.
  const activeVehicles = vehicles.filter(v => v.inventoryStatus === "VALID" || v.inventoryStatus === "WARNING");
  const affectedVehicles = vehicles.filter(v => v.inventoryStatus === "NEEDS_REVIEW" || v.inventoryStatus === "REMOVED");

  // Reason counts
  let duplicateVinCount = 0;
  let missingVinCount = 0;
  let vinIdentityConflictCount = 0;
  let makeModelConflictCount = 0;
  let invalidPriceCount = 0;
  let missingImagesCount = 0;
  let missingMileageCount = 0;
  let staleListingCount = 0;
  let otherCount = 0;

  const affectedDetails: string[] = [];

  for (const v of vehicles) {
    const isDuplicate = v.vin.includes("-DUP-") || vehicles.filter(x => x.vin === v.vin).length > 1;
    const isMissingVin = !v.vin || v.vin.trim() === "";
    const isInvalid = isInvalidVin(v.vin) && !isDuplicate && !isMissingVin;
    const hasVinIdentityConflict = v.vinIdentityStatus !== "VALID";
    const hasInvalidPrice = v.listings.some(l => l.priceStatus === "PRICE_INVALID");
    const hasMissingImages = v.imageValidationStatus === "IMAGE_UNVERIFIED";
    const hasMissingMileage = v.mileageStatus === "MISSING_MILEAGE";
    const hasStaleListing = v.listings.some(l => l.freshnessStatus === "STALE");

    // Check make/model mismatch (not matching current make/model slug normalized)
    let hasMakeModelConflict = false;
    for (const l of v.listings) {
      if (l.validationStatus === "MODEL_MISMATCH" || l.validationStatus === "MAKE_MISMATCH") {
        hasMakeModelConflict = true;
      }
    }

    const isAffected = v.inventoryStatus === "NEEDS_REVIEW" || v.inventoryStatus === "REMOVED";

    if (isDuplicate) duplicateVinCount++;
    if (isMissingVin) missingVinCount++;
    if (hasVinIdentityConflict) vinIdentityConflictCount++;
    if (hasMakeModelConflict) makeModelConflictCount++;
    if (hasInvalidPrice) invalidPriceCount++;
    if (hasMissingImages) missingImagesCount++;
    if (hasMissingMileage) missingMileageCount++;
    if (hasStaleListing) staleListingCount++;

    if (isAffected) {
      if (!isDuplicate && !isMissingVin && !hasVinIdentityConflict && !hasMakeModelConflict && !hasInvalidPrice && !hasMissingImages && !hasMissingMileage && !hasStaleListing) {
        otherCount++;
      }

      const sources = Array.from(new Set(v.listings.map(l => l.source?.name).filter(Boolean))).join(", ") || "Local / Unknown";
      const reasons: string[] = [];
      if (isDuplicate) reasons.push("Duplicate VIN");
      if (isMissingVin) reasons.push("Missing VIN");
      if (isInvalid) reasons.push("Invalid VIN Format");
      if (hasVinIdentityConflict) reasons.push(`VIN Identity Conflict (${v.vinIdentityStatus})`);
      if (hasMakeModelConflict) reasons.push("Make/Model Mismatch");
      if (hasInvalidPrice) reasons.push("Invalid/Fraudulent Pricing");
      if (hasMissingImages) reasons.push("Missing Images");
      if (hasMissingMileage) reasons.push("Missing Mileage");
      if (hasStaleListing) reasons.push("Stale Listing");
      if (reasons.length === 0) reasons.push("Other Validation Issue");

      affectedDetails.push(
        `- VIN: ${v.vin}\n  Make: ${v.model.make.name} | Model: ${v.model.name} | Year: ${v.year}\n  Current Status: ${v.inventoryStatus}\n  Validation Reason: ${reasons.join(", ")}\n  Source: ${sources}`
      );
    }
  }

  console.log("Inventory Quality Report");
  console.log("");
  console.log(`Before Validation:\n${totalVehicles} vehicles`);
  console.log("");
  console.log(`After Validation:\n${activeVehicles.length} vehicles`);
  console.log("");
  console.log(`Affected:\n${affectedVehicles.length} vehicles`);
  console.log("");
  console.log("Breakdown by reason:");
  console.log("");
  console.log(`Duplicate VIN:\n${duplicateVinCount}`);
  console.log("");
  console.log(`Missing VIN:\n${missingVinCount}`);
  console.log("");
  console.log(`VIN Identity Conflict:\n${vinIdentityConflictCount}`);
  console.log("");
  console.log(`Make/Model Conflict:\n${makeModelConflictCount}`);
  console.log("");
  console.log(`Invalid Price:\n${invalidPriceCount}`);
  console.log("");
  console.log(`Missing Images:\n${missingImagesCount}`);
  console.log("");
  console.log(`Missing Mileage:\n${missingMileageCount}`);
  console.log("");
  console.log(`Stale Listing:\n${staleListingCount}`);
  console.log("");
  console.log(`Other:\n${otherCount}`);
  console.log("");
  console.log("==================================================");
  console.log("Detailed Breakdown of Affected Vehicles:");
  console.log("");
  if (affectedDetails.length === 0) {
    console.log("No affected vehicles.");
  } else {
    console.log(affectedDetails.join("\n\n"));
  }
  console.log("==================================================");
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
