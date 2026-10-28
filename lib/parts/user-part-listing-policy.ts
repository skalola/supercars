import { USER_PART_LISTING_STATUSES } from "@/lib/validation/user-part-listing-inputs";

const allowedStatusTransitions: Record<string, readonly string[]> = {
  DRAFT: ["ACTIVE", "REMOVED"],
  ACTIVE: ["INACTIVE", "RESERVED", "SOLD", "REMOVED"],
  INACTIVE: ["ACTIVE", "REMOVED"],
  RESERVED: ["ACTIVE", "SOLD", "REMOVED"],
  SOLD: ["REMOVED"],
  REMOVED: [],
};

export function canTransitionUserPartListing(from: string, to: string) {
  return USER_PART_LISTING_STATUSES.includes(
    to as (typeof USER_PART_LISTING_STATUSES)[number],
  ) && Boolean(allowedStatusTransitions[from]?.includes(to));
}
