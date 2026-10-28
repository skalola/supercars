export const USER_PART_RECONCILIATION_LIMITS = { expiredCheckouts: 100, reminders: 50 } as const;

export function getUserPartReconciliationCutoffs(now = new Date()) {
  return {
    fulfillmentDueBefore: new Date(now.getTime() - 48 * 60 * 60 * 1000),
    reminderRetryBefore: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  };
}
