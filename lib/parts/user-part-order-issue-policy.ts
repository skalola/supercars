export const USER_PART_ORDER_ISSUE_TYPES = ["NOT_RECEIVED", "DAMAGED", "NOT_AS_DESCRIBED", "WRONG_ITEM", "OTHER"] as const;
export type UserPartOrderIssueType = (typeof USER_PART_ORDER_ISSUE_TYPES)[number];
export const USER_PART_ORDER_ISSUE_STATUSES = ["OPEN", "REVIEWING", "RESOLVED", "CLOSED"] as const;
export type UserPartOrderIssueStatus = (typeof USER_PART_ORDER_ISSUE_STATUSES)[number];

export function canReportUserPartOrderIssue(orderStatus: string) {
  return orderStatus === "PAID" || orderStatus === "FULFILLED" || orderStatus === "COMPLETED";
}

export function normalizeOrderIssueDescription(value: string) {
  const description = value.trim().replace(/\s+/g, " ");
  if (description.length < 20 || description.length > 1_500) throw new Error("Describe the issue using 20 to 1,500 characters.");
  return description;
}

export function normalizeOrderIssueAdminNote(value: string) {
  const note = value.trim().replace(/\s+/g, " ");
  if (note.length < 5 || note.length > 1_000) throw new Error("Admin note must contain 5 to 1,000 characters.");
  return note;
}
