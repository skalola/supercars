import React from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { getFulfillmentByIdForUser } from "@/lib/fulfillment/service";

interface TransactionPageProps {
  params: Promise<{
    id: string;
  }>;
}

interface TimelineEvent {
  id: string;
  createdAt: string | Date;
  newStatus: string;
  actorType: string;
}

interface TransactionFee {
  id: string;
  feeType: string;
  amount: number;
  status: string;
}

interface TransactionParty {
  id: string;
  partyType: string;
  name: string;
  companyName?: string | null;
}

interface SellerDisplayRequest {
  id: string;
  publicTransactionToken: string;
  requestType: string;
  status: string;
  createdAt: string | Date;
  requestSummary?: {
    title?: string;
    description?: string | null;
    buyerName?: string;
  };
}

interface BuyerDisplayRequest {
  id: string;
  requestType: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  package?: {
    title: string;
    description?: string | null;
    scopedData: Record<string, unknown>;
  };
}

export default async function TransactionDetailPage({ params }: TransactionPageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  const data = await getFulfillmentByIdForUser(id, userId, session?.user?.role);

  if ("error" in data || !data.request) {
    const errorCode = "error" in data ? data.error : "NOT_FOUND";
    const title = errorCode === "FORBIDDEN"
      ? "You do not have access to this transaction"
      : errorCode === "UNAUTHORIZED"
        ? "Sign in to view this transaction"
        : "Transaction not found";

    return (
    <main className="garage-page-shell transaction-page-shell" style={styles.container}>
      <section style={styles.emptyPanel}>
          <div style={styles.errorBadge}>Unavailable</div>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.muted}>{data.message || "This transaction is unavailable for the current account."}</p>
          <Link href="/transactions" style={styles.primaryAction}>
            Back to transactions
          </Link>
        </section>
      </main>
    );
  }

  const { role, request: req } = data;
  const status = statusPresentation(req.status);
  const partner = role === "BUYER" || role === "ADMIN"
    ? req.parties?.find((party) => !["BUYER", "SELLER", "PLATFORM"].includes(party.partyType))
    : null;

  return (
    <main className="garage-page-shell transaction-page-shell" style={styles.container}>
      <section className="transaction-detail-header" style={styles.header}>
        <div>
          <Link href="/transactions" style={styles.backLink}>
            Back to transactions
          </Link>
          <div style={styles.eyebrow}>{role === "ADMIN" ? "Admin view" : role === "SELLER" ? "Owner view" : "Buyer view"}</div>
          <h1 style={styles.title}>{typeLabel(req.requestType)}</h1>
          <p style={styles.subtitle}>{req.vehicle ? `${req.vehicle.year} ${req.vehicle.make} ${req.vehicle.model}` : "SUPERCARS fulfillment request"}</p>
        </div>
        <div style={styles.statusPanel}>
          <span style={{ ...styles.statusBadge, backgroundColor: status.background, color: status.color }}>{status.label}</span>
          <div style={styles.statusCaption}>{status.caption}</div>
        </div>
      </section>

      <section className="transaction-detail-top-grid" style={styles.topGrid}>
        {req.vehicle && (
          <div style={styles.panel}>
            <div style={styles.panelLabel}>Vehicle</div>
            <h2 style={styles.vehicleTitle}>
              {req.vehicle.year} {req.vehicle.make} {req.vehicle.model}
            </h2>
            {req.vehicle.trim && <div style={styles.mutedStrong}>{req.vehicle.trim}</div>}
            <Link href={`/vehicle/${req.vehicle.vin}`} style={styles.vinLink}>
              {req.vehicle.vin}
            </Link>
          </div>
        )}

        <div style={styles.panel}>
          <div style={styles.panelLabel}>Current Step</div>
          <h2 style={styles.panelTitle}>{status.stepTitle}</h2>
          <p style={styles.muted}>{nextStepCopy(req.status, req.requestType, role)}</p>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelLabel}>Payment</div>
          <h2 style={styles.panelTitle}>{paymentHeadline(req)}</h2>
          <p style={styles.muted}>{paymentCopy(req)}</p>
          {role === "BUYER" && req.requestType === "SERVICE_BOOKING" &&
            ["PAYMENT_REQUIRED", "PROCESSING", "FAILED"].includes(req.paymentStatus) &&
            ["READY_TO_SEND", "PAYMENT_PROCESSING", "ACCEPTED_AWAITING_PAYMENT"].includes(req.status) && (
            <form method="post" action="/api/payments/service-booking-checkout" style={styles.paymentForm}>
              <input type="hidden" name="fulfillmentRequestId" value={req.id} />
              <input type="hidden" name="returnTo" value={`/transactions/${req.publicTransactionToken}`} />
              <button type="submit" style={styles.payButton}>
                Pay booking fee
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="transaction-detail-main-grid" style={styles.mainGrid}>
        <div style={styles.leftStack}>
          {role === "SELLER" ? (
            <OwnerRequestPanel req={req} />
          ) : (
            <BuyerPackagePanel req={req} partnerName={partner?.name || null} />
          )}
          <TimelinePanel events={req.events || []} status={req.status} />
        </div>

        <aside style={styles.rightStack}>
          {req.depositHold && <DepositPanel deposit={req.depositHold} />}
          {role === "BUYER" && req.parties && <PartiesPanel parties={req.parties} />}
          {role === "BUYER" && req.fees && req.fees.length > 0 && <FeesPanel fees={req.fees} requestType={req.requestType} />}
          {req.cancellationReason && (
            <div style={styles.panel}>
              <div style={styles.panelLabel}>Cancellation</div>
              <p style={styles.muted}>{req.cancellationReason}</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function OwnerRequestPanel({ req }: { req: SellerDisplayRequest }) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelLabel}>Request Summary</div>
      <h2 style={styles.panelTitle}>{req.requestSummary?.title || "Buyer request"}</h2>
      {req.requestSummary?.description && <p style={styles.muted}>{req.requestSummary.description}</p>}
      <div className="transaction-detail-card-grid" style={styles.detailGrid}>
        <DetailItem label="Buyer" value={req.requestSummary?.buyerName || "Verified buyer"} />
        <DetailItem label="Status" value={statusPresentation(req.status).label} />
        <DetailItem label="Request" value={typeLabel(req.requestType)} />
        <DetailItem label="Submitted" value={formatDate(req.createdAt)} />
      </div>
    </section>
  );
}

function BuyerPackagePanel({ req, partnerName }: { req: BuyerDisplayRequest; partnerName: string | null }) {
  const entries = Object.entries(req.package?.scopedData || {}).filter(([key]) => !hiddenScopedKeys.has(key));
  return (
    <section style={styles.panel}>
      <div style={styles.panelLabel}>Request Details</div>
      <h2 style={styles.panelTitle}>{req.package?.title || typeLabel(req.requestType)}</h2>
      {req.package?.description && <p style={styles.muted}>{req.package.description}</p>}
      <div className="transaction-detail-card-grid" style={styles.detailGrid}>
        <DetailItem label="Partner" value={partnerName || "Pending"} />
        <DetailItem label="Request" value={typeLabel(req.requestType)} />
        <DetailItem label="Submitted" value={formatDate(req.createdAt)} />
        <DetailItem label="Updated" value={formatDate(req.updatedAt)} />
      </div>
      {entries.length > 0 && (
        <div className="transaction-detail-card-grid" style={styles.scopedList}>
          {entries.slice(0, 10).map(([key, value]) => (
            <DetailItem key={key} label={labelize(key)} value={formatScopedValue(value)} />
          ))}
        </div>
      )}
    </section>
  );
}

function TimelinePanel({ events, status }: { events: TimelineEvent[]; status: string }) {
  const visible = events.filter((event) => shouldShowTimelineEvent(event.newStatus));
  const timeline = visible.length > 0 ? visible : events.slice(-1);
  return (
    <section style={styles.panel}>
      <div style={styles.panelLabel}>Timeline</div>
      <div style={styles.timeline}>
        {timeline.map((event) => {
          const eventStatus = statusPresentation(event.newStatus || status);
          return (
            <div key={event.id} style={styles.timelineItem}>
              <div style={{ ...styles.timelineDot, backgroundColor: eventStatus.color }} />
              <div>
                <div style={styles.timelineTitle}>{eventStatus.label}</div>
                <div style={styles.timelineMeta}>
                  {formatDateTime(event.createdAt)} by {actorLabel(event.actorType)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DepositPanel({ deposit }: { deposit: { amount: number; currency: string; status: string } }) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelLabel}>Deposit Hold</div>
      <div style={styles.moneyValue}>
        ${deposit.amount.toLocaleString()} {deposit.currency}
      </div>
      <span style={styles.smallBadge}>{paymentLabel(deposit.status)}</span>
      <p style={styles.muted}>{depositCopy(deposit.status)}</p>
    </section>
  );
}

function PartiesPanel({ parties }: { parties: TransactionParty[] }) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelLabel}>Participants</div>
      <div style={styles.partyList}>
        {parties.map((party) => (
          <div key={party.id} style={styles.partyRow}>
            <div>
              <div style={styles.partyName}>{party.name}</div>
              {party.companyName && <div style={styles.muted}>{party.companyName}</div>}
            </div>
            <span style={styles.partyBadge}>{partnerLabel(party.partyType)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeesPanel({
  fees,
  requestType,
}: {
  fees: TransactionFee[];
  requestType: string;
}) {
  const visibleFees = fees.filter((fee) => requestType !== "INSURANCE_QUOTE" || fee.feeType !== "REFERRAL_FEE");
  if (visibleFees.length === 0) return null;
  return (
    <section style={styles.panel}>
      <div style={styles.panelLabel}>Fees</div>
      {visibleFees.map((fee) => (
        <div key={fee.id} style={styles.feeRow}>
          <span>{feeLabel(fee.feeType)}</span>
          <strong>${fee.amount.toLocaleString()}</strong>
        </div>
      ))}
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detailItem}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={styles.detailValue}>{value}</div>
    </div>
  );
}

const hiddenScopedKeys = new Set(["decisionTokenUrl", "buyerEmail", "shopEmail"]);

function typeLabel(type: string): string {
  switch (type) {
    case "DEALER_PURCHASE":
      return "Dealer Purchase";
    case "INSURANCE_QUOTE":
      return "Insurance Quote";
    case "TRANSPORT_QUOTE":
      return "Transport Quote";
    case "SERVICE_BOOKING":
      return "Service Booking";
    default:
      return labelize(type);
  }
}

function statusPresentation(status: string) {
  switch (status) {
    case "DRAFT":
      return { label: "Pending", caption: "Partner email needed", stepTitle: "Request is waiting", background: "#FEF3C7", color: "#92400E" };
    case "READY_TO_SEND":
    case "SENT":
      return { label: "Sent", caption: "Awaiting partner response", stepTitle: "Partner review", background: "#DBEAFE", color: "#1D4ED8" };
    case "VIEWED":
      return { label: "Viewed", caption: "Partner opened the request", stepTitle: "Partner review", background: "#E0F2FE", color: "#0369A1" };
    case "ACCEPTED":
      return { label: "Accepted", caption: "Partner confirmed", stepTitle: "Accepted by partner", background: "#D1FAE5", color: "#047857" };
    case "ACCEPTED_AWAITING_PAYMENT":
      return { label: "Payment due", caption: "Shop accepted", stepTitle: "Pay booking fee", background: "#FEF3C7", color: "#92400E" };
    case "PAYMENT_PROCESSING":
      return { label: "Payment processing", caption: "Awaiting Stripe confirmation", stepTitle: "Payment processing", background: "#E0F2FE", color: "#0369A1" };
    case "CONFIRMED":
      return { label: "Confirmed", caption: "Payment received", stepTitle: "Booking confirmed", background: "#D1FAE5", color: "#047857" };
    case "DECLINED":
      return { label: "Declined", caption: "No charge captured", stepTitle: "Request declined", background: "#FEE2E2", color: "#B91C1C" };
    case "EXPIRED":
      return { label: "Expired", caption: "No response received", stepTitle: "Request expired", background: "#F3F4F6", color: "#4B5563" };
    case "CANCELLED":
      return { label: "Cancelled", caption: "Settlement applied", stepTitle: "Request cancelled", background: "#FEE2E2", color: "#B91C1C" };
    case "COMPLETED":
      return { label: "Completed", caption: "Closed", stepTitle: "Fulfillment complete", background: "#DCFCE7", color: "#166534" };
    default:
      return { label: labelize(status), caption: "In progress", stepTitle: "In progress", background: "#F1F5F9", color: "#475569" };
  }
}

function nextStepCopy(status: string, requestType: string, role: "BUYER" | "SELLER" | "ADMIN") {
  if (role === "ADMIN") {
    return "Review this fulfillment transaction as an operations administrator. Buyer, owner, and partner scopes remain enforced for non-admin accounts.";
  }
  if (role === "SELLER") {
    if (status === "ACCEPTED" || status === "ACCEPTED_AWAITING_PAYMENT" || status === "CONFIRMED") return "The partner accepted this request. SUPERCAR DASH will continue transaction coordination.";
    if (status === "COMPLETED") return "This transaction has been marked complete.";
    return "Track the request status here as the buyer and fulfillment partner move through the workflow.";
  }
  if (status === "READY_TO_SEND" && requestType === "SERVICE_BOOKING") return "Complete the booking fee in Stripe before the request is emailed to the shop.";
  if (status === "SENT" || status === "VIEWED" || status === "READY_TO_SEND") return "The request is with the fulfillment partner for review.";
  if (status === "ACCEPTED" && requestType === "INSURANCE_QUOTE") return "The insurance partner accepted the quote request. Policy binding is completed directly with the carrier.";
  if (status === "ACCEPTED" && requestType === "DEALER_PURCHASE") return "The dealer accepted the purchase request. Final vehicle payment and paperwork are completed directly with the selling dealer.";
  if (status === "ACCEPTED_AWAITING_PAYMENT" && requestType === "SERVICE_BOOKING") return "The shop accepted your appointment. Pay the SUPERCAR DASH booking fee to confirm the booking.";
  if (status === "PAYMENT_PROCESSING" && requestType === "SERVICE_BOOKING") return "Stripe is processing the booking fee. This page will show confirmed once the webhook verifies payment.";
  if (status === "CONFIRMED" && requestType === "SERVICE_BOOKING") return "Your booking fee is paid and the appointment is confirmed. Service invoices are paid directly to the shop.";
  if (status === "ACCEPTED") return "The partner accepted the request. Any authorized deposit is now captured according to the request terms.";
  if (status === "DECLINED") return "The partner declined the request. Any authorization hold has been released.";
  if (status === "EXPIRED") return "The partner link expired without a decision. Any authorization hold has been released.";
  if (status === "CANCELLED") return "The request was cancelled and settlement rules have been applied.";
  if (status === "COMPLETED") return "The fulfillment request is complete.";
  return "SUPERCARS is preparing this request for partner review.";
}

function paymentHeadline(req: { paymentStatus: string; requestType?: string; collectedAmount?: number; refundableAmount?: number }) {
  if (req.paymentStatus === "NOT_REQUIRED") return "No payment required";
  if (req.paymentStatus === "PAYMENT_REQUIRED") return "Booking fee due";
  if (req.paymentStatus === "PROCESSING") return "Payment processing";
  if (req.paymentStatus === "PAID") return `$${(req.collectedAmount || 0).toLocaleString()} paid`;
  if (req.paymentStatus === "AUTHORIZED" && req.requestType === "DEALER_PURCHASE") return "Deposit pending dealer acceptance";
  if (req.paymentStatus === "AUTHORIZED") return "Authorization active";
  if (req.paymentStatus === "CAPTURED") return `$${(req.collectedAmount || 0).toLocaleString()} captured`;
  if (req.paymentStatus === "REFUNDED") return "Refund processed";
  if (req.paymentStatus === "VOIDED") return "Authorization released";
  if (req.paymentStatus === "FAILED") return "Payment needs review";
  return paymentLabel(req.paymentStatus);
}

function paymentCopy(req: { paymentStatus: string; requestType?: string; refundableAmount?: number }) {
  if (req.paymentStatus === "PAYMENT_REQUIRED") return "The shop accepted. Pay the SUPERCAR DASH platform booking fee to confirm.";
  if (req.paymentStatus === "PROCESSING") return "Checkout was started. Payment is confirmed only after Stripe sends a verified webhook.";
  if (req.paymentStatus === "PAID" && req.requestType === "DEALER_PURCHASE") return "The purchase request deposit is paid. Final vehicle payment and paperwork are handled directly by the selling dealer.";
  if (req.paymentStatus === "PAID") return "The platform booking fee has been paid. Repair invoices are paid directly to the service shop.";
  if (req.paymentStatus === "AUTHORIZED" && req.requestType === "DEALER_PURCHASE") return "Your card is authorized only. SUPERCAR DASH captures the deposit only if the dealer accepts the purchase request.";
  if (req.paymentStatus === "AUTHORIZED") return "Funds are authorized only. Capture happens after partner acceptance.";
  if (req.paymentStatus === "CAPTURED") return "Funds were captured after partner acceptance.";
  if (req.paymentStatus === "REFUNDED") return "A refund has been applied according to the cancellation policy.";
  if (req.paymentStatus === "VOIDED") return "The authorization was released before capture.";
  if (req.paymentStatus === "NOT_REQUIRED") return "This request does not require a buyer deposit.";
  if (req.paymentStatus === "FAILED") return "Payment failed or was declined. You can retry checkout before the request is sent to the shop.";
  return "Payment status will update as the request moves forward.";
}

function depositCopy(status: string) {
  if (status === "AUTHORIZED" || status === "HELD") return "This is an authorization hold. It is captured only if the partner accepts.";
  if (status === "CAPTURED") return "Captured after partner acceptance.";
  if (status === "RELEASED") return "Released before capture.";
  if (status === "REFUNDED") return "Refunded after cancellation.";
  return "Deposit state will update with the request.";
}

function shouldShowTimelineEvent(status: string) {
  return ["DRAFT", "READY_TO_SEND", "SENT", "VIEWED", "ACCEPTED", "ACCEPTED_AWAITING_PAYMENT", "PAYMENT_PROCESSING", "CONFIRMED", "DECLINED", "EXPIRED", "CANCELLED", "COMPLETED"].includes(status);
}

function actorLabel(actorType: string) {
  if (actorType === "PARTNER") return "partner";
  if (actorType === "BUYER") return "buyer";
  if (actorType === "ADMIN") return "SUPERCARS";
  return "system";
}

function paymentLabel(status: string): string {
  return labelize(status);
}

function partnerLabel(type: string): string {
  return labelize(type);
}

function feeLabel(type: string): string {
  if (type === "DEPOSIT") return "Deposit";
  if (type === "SERVICE_FEE") return "Service booking fee";
  if (type === "TRANSPORT_FEE") return "Transport estimate";
  if (type === "COMMISSION") return "Marketplace fee";
  return labelize(type);
}

function labelize(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatScopedValue(value: unknown): string {
  if (value === null || value === undefined) return "Not provided";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatScopedValue).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${labelize(key)}: ${formatScopedValue(val)}`)
      .join("; ");
  }
  return String(value);
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    color: "#ffffff",
  },
  header: {
    marginBottom: "22px",
  },
  backLink: {
    display: "inline-block",
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: "13px",
    fontWeight: 750,
    textDecoration: "none",
    marginBottom: "14px",
  },
  eyebrow: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: "12px",
    fontWeight: 850,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  title: {
    color: "#ffffff",
    fontSize: "30px",
    lineHeight: 1.1,
    fontWeight: 850,
    margin: "4px 0 8px",
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.66)",
    margin: 0,
    fontSize: "15px",
  },
  statusPanel: {
    minWidth: "190px",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "8px",
    padding: "14px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    textAlign: "right",
    backdropFilter: "blur(18px)",
  },
  statusBadge: {
    display: "inline-flex",
    minHeight: "28px",
    alignItems: "center",
    borderRadius: "999px",
    padding: "0 12px",
    fontSize: "13px",
    fontWeight: 850,
  },
  statusCaption: {
    color: "rgba(255, 255, 255, 0.62)",
    fontSize: "12px",
    marginTop: "6px",
  },
  topGrid: {
    marginBottom: "18px",
  },
  mainGrid: {},
  leftStack: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  rightStack: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  panel: {
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "8px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#ffffff",
    padding: "18px",
    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.22)",
    backdropFilter: "blur(18px)",
  },
  emptyPanel: {
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "8px",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    padding: "36px",
    maxWidth: "560px",
    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.22)",
  },
  errorBadge: {
    display: "inline-block",
    backgroundColor: "#FEE2E2",
    color: "#B91C1C",
    borderRadius: "999px",
    padding: "5px 10px",
    fontSize: "12px",
    fontWeight: 850,
    marginBottom: "12px",
  },
  panelLabel: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: "11px",
    fontWeight: 850,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "9px",
  },
  panelTitle: {
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: 850,
    margin: "0 0 8px",
    lineHeight: 1.25,
  },
  vehicleTitle: {
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: 850,
    margin: "0 0 4px",
  },
  vinLink: {
    display: "inline-block",
    marginTop: "10px",
    color: "rgba(255, 255, 255, 0.78)",
    textDecoration: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "13px",
    fontWeight: 750,
  },
  muted: {
    color: "rgba(255, 255, 255, 0.66)",
    fontSize: "14px",
    lineHeight: 1.5,
    margin: 0,
  },
  mutedStrong: {
    color: "rgba(255, 255, 255, 0.76)",
    fontSize: "14px",
    fontWeight: 750,
  },
  detailGrid: {
    marginTop: "14px",
  },
  scopedList: {
    marginTop: "14px",
    paddingTop: "14px",
    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
  },
  detailItem: {
    minWidth: 0,
  },
  detailLabel: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: "11px",
    fontWeight: 850,
    textTransform: "uppercase",
    marginBottom: "3px",
  },
  detailValue: {
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 750,
    lineHeight: 1.35,
    overflowWrap: "anywhere",
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  timelineItem: {
    display: "grid",
    gridTemplateColumns: "12px 1fr",
    gap: "10px",
    alignItems: "start",
  },
  timelineDot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    marginTop: "4px",
  },
  timelineTitle: {
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 850,
  },
  timelineMeta: {
    color: "rgba(255, 255, 255, 0.58)",
    fontSize: "12px",
    marginTop: "2px",
  },
  moneyValue: {
    color: "#86efac",
    fontSize: "24px",
    fontWeight: 850,
    marginBottom: "8px",
  },
  smallBadge: {
    display: "inline-flex",
    minHeight: "24px",
    alignItems: "center",
    borderRadius: "999px",
    padding: "0 10px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: 850,
    marginBottom: "10px",
  },
  partyList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  partyRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "center",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    paddingBottom: "10px",
  },
  partyName: {
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 850,
  },
  partyBadge: {
    flex: "0 0 auto",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    color: "rgba(255, 255, 255, 0.76)",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "11px",
    fontWeight: 850,
  },
  feeRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    color: "#ffffff",
    fontSize: "14px",
    padding: "9px 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  },
  primaryAction: {
    display: "inline-block",
    marginTop: "18px",
    backgroundColor: "#e20f1b",
    color: "#FFFFFF",
    borderRadius: "6px",
    padding: "10px 14px",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 850,
  },
  paymentForm: {
    marginTop: "14px",
  },
  payButton: {
    width: "100%",
    border: 0,
    borderRadius: "6px",
    backgroundColor: "#e20f1b",
    color: "#FFFFFF",
    padding: "11px 14px",
    fontSize: "13px",
    fontWeight: 850,
    cursor: "pointer",
  },
};
