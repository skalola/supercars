export const DEALER_PURCHASE_FEE_THRESHOLD = 200000;
export const DEALER_PURCHASE_LOW_RATE = 0.015;
export const DEALER_PURCHASE_HIGH_RATE = 0.02;

export function getDealerPurchaseDepositRate(vehiclePrice: number) {
  return vehiclePrice < DEALER_PURCHASE_FEE_THRESHOLD
    ? DEALER_PURCHASE_LOW_RATE
    : DEALER_PURCHASE_HIGH_RATE;
}

export function getDealerPurchaseDepositPercentLabel(vehiclePrice: number) {
  return vehiclePrice < DEALER_PURCHASE_FEE_THRESHOLD ? "1.5%" : "2%";
}

export function getDealerPurchaseDepositAmount(vehiclePrice: number) {
  if (!Number.isFinite(vehiclePrice) || vehiclePrice <= 0) return 0;
  return Math.round(vehiclePrice * getDealerPurchaseDepositRate(vehiclePrice));
}

export function getDealerPurchaseDepositCentsForPrice(vehiclePrice: number) {
  if (!Number.isFinite(vehiclePrice) || vehiclePrice <= 0) return 0;
  return getDealerPurchaseDepositAmount(vehiclePrice) * 100;
}
