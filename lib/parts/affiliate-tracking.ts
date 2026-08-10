type AffiliateReadyPart = {
  status: string;
  affiliateUrl: string | null;
  trackingStatus: string;
  affiliatePartner: {
    active: boolean;
    status: string;
  } | null;
};

const ACTIVE_PARTNER_STATUSES = new Set(["ACTIVE", "APPROVED"]);

export function isAffiliateTrackingReady(part: AffiliateReadyPart) {
  return Boolean(
    part.status === "ACTIVE" &&
      part.affiliateUrl &&
      part.trackingStatus === "CONFIGURED" &&
      part.affiliatePartner?.active &&
      ACTIVE_PARTNER_STATUSES.has(part.affiliatePartner.status)
  );
}

export function isSafeOutboundUrl(value: string | null | undefined) {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
