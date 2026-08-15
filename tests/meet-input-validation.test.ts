import assert from "node:assert/strict";
import test from "node:test";
import {
  addMeetPhotoInputSchema,
  createMeetInputSchema,
  manageMeetRsvpInputSchema,
  meetRsvpInputSchema,
} from "../lib/validation/meet-inputs";

const validMeet = {
  title: "Charlotte Cars and Coffee",
  type: "Cars & Coffee",
  startsAt: "2026-09-12T09:00",
  capacity: "100",
  city: "Charlotte",
  state: "nc",
  locationName: "Uptown Motor Plaza",
  locationDetail: "Address shared after RSVP",
  exactAddress: "",
  description: "Community event",
  visibility: "PUBLIC",
} as const;

test("meet creation normalizes location, date, and capacity", () => {
  const parsed = createMeetInputSchema.parse(validMeet);
  assert.equal(parsed.state, "NC");
  assert.equal(parsed.capacity, 100);
  assert.equal(parsed.startsAt instanceof Date, true);
  assert.equal(parsed.exactAddress, null);
  assert.equal(createMeetInputSchema.safeParse({ ...validMeet, startsAt: "not-a-date" }).success, false);
  assert.equal(createMeetInputSchema.safeParse({ ...validMeet, capacity: "1000000" }).success, false);
});

test("RSVP inputs reject unsupported status fallbacks", () => {
  assert.equal(
    meetRsvpInputSchema.safeParse({ meetId: "meet_1", vehicleId: null, status: "GOING" }).success,
    true
  );
  assert.equal(
    meetRsvpInputSchema.safeParse({ meetId: "meet_1", vehicleId: null, status: "APPROVED" }).success,
    false
  );
  assert.equal(
    manageMeetRsvpInputSchema.safeParse({ rsvpId: "rsvp_1", action: "REMOVE_ALL" }).success,
    false
  );
});

test("meet photo input accepts only bounded HTTP image locations", () => {
  assert.equal(
    addMeetPhotoInputSchema.safeParse({
      meetId: "meet_1",
      vehicleId: null,
      photoUrl: "https://images.example.com/meet.jpg",
      caption: "Morning lineup",
    }).success,
    true
  );
  assert.equal(
    addMeetPhotoInputSchema.safeParse({
      meetId: "meet_1",
      vehicleId: null,
      photoUrl: "javascript:alert(1)",
      caption: "",
    }).success,
    false
  );
});
