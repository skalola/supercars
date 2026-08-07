export function isKnownInactiveListingUrl(value: string | null | undefined) {
  if (!value) return false;
  return /\/(?:sold-images|pre-owned-inventory-sold|used-inventory-sold|inventory-sold|sold-inventory)\b|[?&](?:status|listingStatus)=sold\b/i.test(
    value
  );
}
