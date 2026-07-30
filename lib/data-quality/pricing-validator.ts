export type PriceValidationStatus = "VALID_PRICE" | "PRICE_MISSING" | "PRICE_INVALID";

/**
 * Validates listing pricing bounds to protect analytics and intelligence metrics.
 */
export function validatePrice(price: number | null): {
  status: PriceValidationStatus;
  reason?: string;
} {
  if (price === null || price === undefined) {
    return { status: "PRICE_MISSING", reason: "Price is missing" };
  }

  // Minimum threshold for supported supercar inventory.
  if (price < 10000) {
    return { status: "PRICE_INVALID", reason: `Price is below $10,000 minimum: $${price}` };
  }

  // Maximum upper boundary for unrealistic values (e.g. > $20,000,000)
  if (price > 20000000) {
    return { status: "PRICE_INVALID", reason: `Unrealistic pricing value: $${price}` };
  }

  return { status: "VALID_PRICE" };
}
