export type UserPartModerationAction = "HIDE" | "REMOVE";

export function canModerateUserPartListing(status: string, action: UserPartModerationAction) {
  if (action === "HIDE") return status === "ACTIVE";
  return status === "DRAFT" || status === "ACTIVE" || status === "INACTIVE";
}

export function getModeratedListingStatus(action: UserPartModerationAction) {
  return action === "HIDE" ? "INACTIVE" : "REMOVED";
}

export function normalizeModerationReason(reason: string) {
  const normalized = reason.trim().replace(/\s+/g, " ");
  if (normalized.length < 5 || normalized.length > 300) {
    throw new Error("Moderation reason must contain 5 to 300 characters.");
  }
  return normalized;
}
