export type PartnerPaymentDecision = "ACCEPTED" | "DECLINED";

export function getPartnerDecisionStatus(
  requestType: string,
  decision: PartnerPaymentDecision,
  paymentStatus?: string,
): string {
  if (decision === "DECLINED") return "DECLINED";
  if (requestType !== "SERVICE_BOOKING") return "ACCEPTED";
  return paymentStatus === "AUTHORIZED" || paymentStatus === "PAID"
    ? "CONFIRMED"
    : "ACCEPTED_AWAITING_PAYMENT";
}

export function getCancellationSettlement(originalDeposit: number, policyFee = 100) {
  const normalizedDeposit = Math.max(0, originalDeposit);
  const normalizedPolicyFee = Math.max(0, Math.min(policyFee, normalizedDeposit));
  return {
    policyFee: normalizedPolicyFee,
    refundAmount: normalizedDeposit - normalizedPolicyFee,
  };
}

export function canReuseCheckoutSession(input: {
  checkoutUrl: string | null;
  checkoutExpiresAt: Date | null;
  status: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  return Boolean(
    input.checkoutUrl &&
      input.checkoutExpiresAt &&
      input.checkoutExpiresAt > now &&
      (input.status === "HELD" || input.status === "AUTHORIZED")
  );
}
