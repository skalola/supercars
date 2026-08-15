import assert from "node:assert/strict";
import test from "node:test";
import {
  dealerPurchaseInputSchema,
  insuranceQuoteInputSchema,
  serviceBookingInputSchema,
  transportQuoteInputSchema,
} from "../lib/validation/owner-transaction-inputs";
import {
  completeMaintenanceInputSchema,
  deleteVehicleModificationInputSchema,
  serviceRecordInputSchema,
  vehicleModificationInputSchema,
  vehicleProfileInputSchema,
} from "../lib/validation/passport-inputs";

test("dealer purchase input bounds money and normalizes buyer details", () => {
  const input = dealerPurchaseInputSchema.parse({
    listingId: "listing_1",
    amount: 250_000,
    buyerEmail: " BUYER@EXAMPLE.COM ",
    requestedTerms: { financingRequired: true, tradeInVin: " zff67nfa1b0177323 " },
  });
  assert.equal(input.buyerEmail, "buyer@example.com");
  assert.equal(input.requestedTerms?.tradeInVin, "ZFF67NFA1B0177323");
  assert.equal(dealerPurchaseInputSchema.safeParse({ listingId: "listing_1", amount: Number.NaN }).success, false);
  assert.equal(dealerPurchaseInputSchema.safeParse({ listingId: "listing_1", amount: -1 }).success, false);
});

test("insurance and transport inputs reject invalid runtime states and addresses", () => {
  assert.equal(
    insuranceQuoteInputSchema.safeParse({ purchaseId: "purchase_1", status: "PAID" }).success,
    false
  );
  assert.equal(
    transportQuoteInputSchema.safeParse({
      purchaseId: "purchase_1",
      address: { streetAddress: "1 Main St", city: "Charlotte", state: "NC", postalCode: "28269" },
      transportMethod: "ENCLOSED",
    }).success,
    true
  );
  assert.equal(
    transportQuoteInputSchema.safeParse({
      purchaseId: "purchase_1",
      address: { streetAddress: "1 Main St", city: "Charlotte", state: "North Carolina", postalCode: "bad" },
    }).success,
    false
  );
});

test("service booking requires a VIN and bounded complete appointment details", () => {
  assert.equal(
    serviceBookingInputSchema.safeParse({
      vin: "ZFF67NFA1B0177323",
      serviceName: "Annual service",
      shopName: "Ferrari Charlotte",
      preferredDate: "2026-09-01",
      preferredTime: "10:00 AM",
      acceptedTerms: true,
    }).success,
    true
  );
  assert.equal(
    serviceBookingInputSchema.safeParse({
      vin: "ZFF67NFA1B0177323",
      serviceName: "Annual service",
      shopName: "Ferrari Charlotte",
      preferredDate: "2026-09-01",
      preferredTime: "10:00 AM",
      acceptedTerms: false,
    }).success,
    false
  );
  assert.equal(
    serviceBookingInputSchema.safeParse({
      vin: "invalid",
      serviceName: "",
      shopName: "Shop",
      preferredDate: "",
      preferredTime: "",
    }).success,
    false
  );
});

test("passport mileage, costs, dates, and gains are finite and bounded", () => {
  assert.equal(vehicleProfileInputSchema.safeParse({ currentMileage: 12_500 }).success, true);
  assert.equal(vehicleProfileInputSchema.safeParse({ currentMileage: -1 }).success, false);
  assert.equal(serviceRecordInputSchema.safeParse({ serviceDate: "2026-02-31" }).success, false);
  assert.equal(serviceRecordInputSchema.safeParse({ serviceDate: "2026-02-28", cost: -50 }).success, false);
  assert.equal(
    completeMaintenanceInputSchema.safeParse({
      serviceName: "Oil service",
      serviceDate: "2026-02-28",
      mileage: 0,
    }).success,
    true
  );
  assert.equal(
    vehicleModificationInputSchema.safeParse({ name: "Tune", hpGainOverride: 100_000 }).success,
    false
  );
});

test("modification deletion requires at least one valid scoped id", () => {
  assert.equal(deleteVehicleModificationInputSchema.safeParse({}).success, false);
  assert.equal(
    deleteVehicleModificationInputSchema.safeParse({ modificationId: "mod_1", installedPartId: null }).success,
    true
  );
});
