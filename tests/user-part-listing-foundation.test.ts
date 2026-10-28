import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionUserPartListing } from "../lib/parts/user-part-listing-policy";
import { userPartListingInputSchema } from "../lib/validation/user-part-listing-inputs";

const validListing = {
  componentTypeId: "component_1",
  brandId: null,
  removedFromVehicleId: null,
  title: "Cold air intake with heat shield",
  description: "Used intake in good condition with clamps, couplers, and the original heat shield included.",
  brandName: "Injen",
  manufacturerPartNumber: "SP1476",
  condition: "USED",
  priceCents: 27500,
  currency: "USD",
  quantity: 1,
  mileageOnPart: 12000,
  includedHardware: "Clamps, couplers, and heat shield",
  knownDefects: null,
  shippingMode: "BOTH",
  shippingCostCents: 2500,
  shipsFromCity: "Charlotte",
  shipsFromState: "NC",
  returnPolicy: "NO_RETURNS",
  universalFitment: false,
  fitments: [{
    makeId: "make_1",
    modelId: "model_1",
    modelVariantId: null,
    yearStart: 2002,
    yearEnd: 2006,
    trim: "Type-S",
    engine: "K20A2",
    transmission: "Manual",
    drivetrain: "FWD",
    bodyStyle: "Coupe",
  }],
};

test("user part listings require structured vehicle fitment", () => {
  assert.equal(userPartListingInputSchema.safeParse(validListing).success, true);
  assert.equal(userPartListingInputSchema.safeParse({ ...validListing, fitments: [] }).success, false);
});

test("universal listings cannot also claim specific fitment", () => {
  assert.equal(userPartListingInputSchema.safeParse({ ...validListing, universalFitment: true }).success, false);
  assert.equal(userPartListingInputSchema.safeParse({ ...validListing, universalFitment: true, fitments: [] }).success, true);
});

test("shipping and local pickup collect the required fulfillment details", () => {
  assert.equal(userPartListingInputSchema.safeParse({ ...validListing, shippingCostCents: null }).success, false);
  assert.equal(userPartListingInputSchema.safeParse({ ...validListing, shippingMode: "LOCAL_PICKUP", shippingCostCents: null }).success, true);
});

test("listing lifecycle prevents removed listings from returning to market", () => {
  assert.equal(canTransitionUserPartListing("DRAFT", "ACTIVE"), true);
  assert.equal(canTransitionUserPartListing("ACTIVE", "SOLD"), true);
  assert.equal(canTransitionUserPartListing("SOLD", "ACTIVE"), false);
  assert.equal(canTransitionUserPartListing("REMOVED", "ACTIVE"), false);
});
