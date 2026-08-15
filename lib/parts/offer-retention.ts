export const PART_OFFER_RETENTION_POLICY = {
  staleAfterExpiration: true,
  inactiveAfterDays: 14,
  purgeAfterDays: 45,
} as const;

export function getPartOfferRetentionCutoffs(now = new Date()) {
  return {
    expiredAt: now,
    inactiveBefore: new Date(now.getTime() - PART_OFFER_RETENTION_POLICY.inactiveAfterDays * 86_400_000),
    purgeBefore: new Date(now.getTime() - PART_OFFER_RETENTION_POLICY.purgeAfterDays * 86_400_000),
  };
}
