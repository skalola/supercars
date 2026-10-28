import {
  refreshSellerPaymentStatusAction,
  startSellerOnboardingAction,
} from "@/app/actions/seller-payments";

type SellerPaymentPanelProps = {
  account: {
    onboardingStatus: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requirementsDue: string[];
    disabledReason: string | null;
    lastSyncedAt: Date | null;
  } | null;
  notice?: string;
};

function statusCopy(account: SellerPaymentPanelProps["account"]) {
  if (!account) return { label: "Not connected", tone: "pending", body: "Connect a Stripe seller account before listing parts for sale." };
  if (account.onboardingStatus === "READY" && account.chargesEnabled && account.payoutsEnabled) {
    return { label: "Ready to sell", tone: "ready", body: "Stripe can accept buyer payments and send payouts to your account." };
  }
  if (account.onboardingStatus === "RESTRICTED") {
    return { label: "Action required", tone: "attention", body: "Stripe needs updated seller information before payments or payouts can continue." };
  }
  if (account.onboardingStatus === "PENDING") {
    return { label: "Verification pending", tone: "pending", body: "Stripe is reviewing your seller details. You can refresh this status at any time." };
  }
  return { label: "Setup incomplete", tone: "pending", body: "Finish Stripe-hosted onboarding to activate seller payments." };
}

export function SellerPaymentPanel({ account, notice }: SellerPaymentPanelProps) {
  const status = statusCopy(account);
  const ready = status.tone === "ready";
  const setupLabel = account ? "Continue Stripe Setup" : "Set Up Seller Payments";

  return (
    <section className="seller-payment-panel" aria-labelledby="seller-payment-title">
      <div className="seller-payment-heading">
        <div>
          <span>Parts Marketplace</span>
          <h2 id="seller-payment-title">Seller payments</h2>
        </div>
        <strong className={`seller-payment-status is-${status.tone}`}>{status.label}</strong>
      </div>

      <p>{status.body}</p>
      <ul>
        <li className={account?.chargesEnabled ? "is-complete" : ""}>Buyer payments enabled</li>
        <li className={account?.payoutsEnabled ? "is-complete" : ""}>Seller payouts enabled</li>
        <li className={ready ? "is-complete" : ""}>Eligible to publish parts</li>
      </ul>

      {notice === "updated" ? <p className="seller-payment-notice is-success">Stripe account status updated.</p> : null}
      {notice?.endsWith("error") ? <p className="seller-payment-notice is-error">Stripe could not refresh this account. Please try again.</p> : null}
      {account?.disabledReason ? <p className="seller-payment-notice is-error">Stripe status: {account.disabledReason.replaceAll("_", " ")}</p> : null}

      <div className="seller-payment-actions">
        {!ready ? (
          <form action={startSellerOnboardingAction}>
            <button type="submit">{setupLabel}</button>
          </form>
        ) : null}
        {account ? (
          <form action={refreshSellerPaymentStatusAction}>
            <button type="submit" className="is-secondary">Refresh Status</button>
          </form>
        ) : null}
      </div>

      <small>Identity, tax, and banking details are collected and stored by Stripe. SUPERCAR DASH never receives them.</small>
    </section>
  );
}
