/**
 * Vehicle marketplace acquisition is paused while SUPERCAR DASH focuses on
 * ownership. Existing listing data remains intact for a future reactivation.
 */
export const VEHICLE_MARKETPLACE_ENABLED =
  process.env.VEHICLE_MARKETPLACE_ENABLED === "true";

export function assertVehicleMarketplaceEnabled() {
  if (!VEHICLE_MARKETPLACE_ENABLED) {
    throw new Error(
      "Vehicle marketplace acquisition is disabled. Set VEHICLE_MARKETPLACE_ENABLED=true to run it intentionally.",
    );
  }
}
