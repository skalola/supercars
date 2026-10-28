export const USER_PART_SELLER_POLICY_VERSION = "2026-10-28";

export type UserPartShippingRestriction = "STANDARD" | "LOCAL_PICKUP_ONLY";

const LOCAL_PICKUP_PATTERNS = [
  /\bair\s*bag\b/i,
  /\bairbag\b/i,
  /\bsrs\b/i,
  /\bseat\s*belt\s*(pretensioner|retractor)\b/i,
  /\bbatter(?:y|ies)\b/i,
  /\blithium\b/i,
  /\b(engine|motor|gear|transmission|brake|power steering|coolant|antifreeze)\s*(oil|fluid)\b/i,
  /\b(oil|fluid|coolant|antifreeze)\b/i,
  /\bfuel\s*(tank|cell|can|container)\b/i,
  /\bpressuri[sz]ed\b/i,
  /\bnitrous\b/i,
  /\bfire\s*extinguisher\b/i,
];

export function getUserPartShippingRestriction(input: {
  componentName: string;
  categoryName: string;
}): UserPartShippingRestriction {
  const taxonomyLabel = `${input.categoryName} ${input.componentName}`;
  return LOCAL_PICKUP_PATTERNS.some((pattern) => pattern.test(taxonomyLabel))
    ? "LOCAL_PICKUP_ONLY"
    : "STANDARD";
}

export function isCurrentSellerAttestation(input: {
  sellerAttestedAt: Date | null;
  sellerPolicyVersion: string | null;
}) {
  return Boolean(
    input.sellerAttestedAt && input.sellerPolicyVersion === USER_PART_SELLER_POLICY_VERSION,
  );
}
