export const USER_PART_DISPUTE_EVENT_TYPES = [
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
] as const;

export function isUserPartDisputeEvent(eventType: string) {
  return USER_PART_DISPUTE_EVENT_TYPES.includes(eventType as (typeof USER_PART_DISPUTE_EVENT_TYPES)[number]);
}

export function getUserPartDisputeOrderStatus(input: {
  eventType: string;
  disputeStatus: string | null;
  previousOrderStatus: string | null;
}) {
  if (input.disputeStatus === "won" || input.eventType === "charge.dispute.funds_reinstated") {
    return input.previousOrderStatus && !["DISPUTED", "CHARGEBACK"].includes(input.previousOrderStatus)
      ? input.previousOrderStatus
      : "PAID";
  }
  if (input.disputeStatus === "lost") return "CHARGEBACK";
  return "DISPUTED";
}

export function isTerminalUserPartDisputeStatus(status: string | null) {
  return status === "won" || status === "lost";
}
