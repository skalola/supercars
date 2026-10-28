export const USER_PART_PLATFORM_FEE_BASIS_POINTS = 500;

export function getUserPartPlatformFeeCents(itemAmountCents: number) {
  if (!Number.isInteger(itemAmountCents) || itemAmountCents <= 0) {
    throw new Error("A positive integer item amount is required.");
  }
  return Math.round((itemAmountCents * USER_PART_PLATFORM_FEE_BASIS_POINTS) / 10_000);
}

export function getUserPartCheckoutKey(orderId: string, totalAmountCents: number) {
  return `scd:user-part:${orderId}:${totalAmountCents}:v1-direct-charge`;
}

export function isReusableUserPartCheckout(input: {
  status: string;
  checkoutUrl: string | null;
  checkoutExpiresAt: Date | null;
}) {
  return input.status === "CHECKOUT_PENDING"
    && Boolean(input.checkoutUrl)
    && Boolean(input.checkoutExpiresAt && input.checkoutExpiresAt.getTime() > Date.now() + 60_000);
}
