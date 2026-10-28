export const USER_PART_ORDER_STATUSES = [
  "CHECKOUT_PENDING",
  "PAID",
  "FULFILLED",
  "COMPLETED",
  "REFUND_PENDING",
  "REFUNDED",
  "CANCELLED",
] as const;

export type UserPartOrderStatus = (typeof USER_PART_ORDER_STATUSES)[number];

export function canSellerFulfillUserPartOrder(status: string) {
  return status === "PAID";
}

export function canBuyerCompleteUserPartOrder(status: string) {
  return status === "FULFILLED";
}

export function canSellerRefundUserPartOrder(status: string) {
  return status === "PAID" || status === "FULFILLED";
}

export function normalizeTrackingUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Tracking link must use HTTP or HTTPS.");
  }
  return parsed.toString();
}
