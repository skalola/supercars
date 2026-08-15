import assert from "node:assert/strict";
import test from "node:test";
import {
  clubInviteTokenSchema,
  clubMemberActionInputSchema,
  createClubInputSchema,
  garageAlertInputSchema,
  trackerPreferenceInputSchema,
  usernameInputSchema,
  vehicleListingInputSchema,
} from "../lib/validation/community-inputs";
import { accountRegistrationSchema, accountSignInSchema } from "../lib/validation/auth-inputs";

test("usernames normalize safely and reject path-shaped values", () => {
  assert.equal(usernameInputSchema.parse(" Driver_One "), "driver_one");
  assert.equal(usernameInputSchema.safeParse("ab").success, false);
  assert.equal(usernameInputSchema.safeParse("driver/../../admin").success, false);
});

test("account login accepts username or email identifiers without accepting empty passwords", () => {
  assert.equal(accountSignInSchema.safeParse({ identifier: "driver_one", password: "secret" }).success, true);
  assert.equal(accountSignInSchema.safeParse({ identifier: "driver@example.com", password: "" }).success, false);
});

test("account registration normalizes identity and requires matching strong passwords", () => {
  const parsed = accountRegistrationSchema.parse({
    username: " Driver_One ",
    email: " DRIVER@EXAMPLE.COM ",
    password: "ten-characters",
    confirmPassword: "ten-characters",
  });
  assert.equal(parsed.username, "driver_one");
  assert.equal(parsed.email, "driver@example.com");
  assert.equal(
    accountRegistrationSchema.safeParse({
      username: "driver_two",
      email: "driver2@example.com",
      password: "ten-characters",
      confirmPassword: "does-not-match",
    }).success,
    false,
  );
});

test("garage and tracker toggles require runtime booleans and known types", () => {
  assert.equal(
    garageAlertInputSchema.safeParse({ itemId: "item_1", alertType: "price", enabled: true }).success,
    true
  );
  assert.equal(
    garageAlertInputSchema.safeParse({ itemId: "item_1", alertType: "maintenance", enabled: true }).success,
    false
  );
  assert.equal(
    trackerPreferenceInputSchema.safeParse({ type: "events", enabled: "true" }).success,
    false
  );
});

test("vehicle listing inputs require a valid VIN and finite positive price", () => {
  const parsed = vehicleListingInputSchema.parse({ vin: " zff67nfa1b0177323 ", askingPrice: 175_000 });
  assert.equal(parsed.vin, "ZFF67NFA1B0177323");
  assert.equal(vehicleListingInputSchema.safeParse({ vin: parsed.vin, askingPrice: Infinity }).success, false);
  assert.equal(vehicleListingInputSchema.safeParse({ vin: parsed.vin, askingPrice: 0 }).success, false);
});

test("club input normalizes nationwide clubs without distorting location fields", () => {
  const parsed = createClubInputSchema.parse({
    name: "National Drivers",
    nationwide: true,
    city: "",
    state: "",
    country: "us",
    description: "",
    visibility: "PUBLIC",
    modelIds: ["model_1", "model_1"],
    makeIds: ["make_1"],
  });
  assert.equal(parsed.city, "Nationwide");
  assert.equal(parsed.state, "US");
  assert.equal(parsed.country, "US");
  assert.deepEqual(parsed.modelIds, ["model_1"]);
});

test("club moderation and invite tokens accept only supported shapes", () => {
  assert.equal(
    clubMemberActionInputSchema.safeParse({ memberId: "member_1", action: "PROMOTE" }).success,
    true
  );
  assert.equal(
    clubMemberActionInputSchema.safeParse({ memberId: "member_1", action: "MAKE_OWNER" }).success,
    false
  );
  assert.equal(clubInviteTokenSchema.safeParse("v1.payload.signature").success, true);
  assert.equal(clubInviteTokenSchema.safeParse("https://example.com/invite").success, false);
});
