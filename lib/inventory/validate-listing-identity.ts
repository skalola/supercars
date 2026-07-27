import { isModelMatch } from "../data-quality/inventory-validator";

export function isListingMatchForModel(
  listing: any,
  model: { name: string; make: { name: string }; slug: string }
): boolean {
  const vehicle = listing?.vehicle;
  const vModel = vehicle?.model;
  const vMake = vModel?.make;
  const vin = vehicle?.vin || "UNKNOWN_VIN";

  if (!vehicle) {
    console.warn(`[Listing Identity Mismatch] VIN: ${vin} - Listing has no associated vehicle.`);
    return false;
  }

  if (!vModel || !vMake) {
    console.warn(`[Listing Identity Mismatch] VIN: ${vin} - Vehicle does not have complete model/make relationships loaded.`);
    return false;
  }

  const makeMatch = vMake.name.toLowerCase().trim() === model.make.name.toLowerCase().trim();
  const modelMatch = isModelMatch(model.name, model.slug, vModel.name);

  if (!makeMatch || !modelMatch) {
    console.warn(
      `[Listing Identity Mismatch] VIN: ${vin} - Expected Make/Model: "${model.make.name} ${model.name}", Actual Make/Model: "${vMake.name} ${vModel.name}".`
    );
    return false;
  }

  if (listing.validationStatus === "MODEL_MISMATCH" || vehicle.vinIdentityStatus === "MODEL_MISMATCH") {
    return false;
  }

  return true;
}
