import React from "react";
import { getBuyerFulfillmentTransaction } from "@/lib/fulfillment/service";

interface BuyerPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function BuyerFulfillmentPage({ params }: BuyerPageProps) {
  const { token } = await params;
  const data = await getBuyerFulfillmentTransaction(token);

  if ("error" in data || !data.request) {
    return (
      <main className="garage-page-shell fulfillment-page-shell" style={styles.container}>
        <div style={styles.card}>
          <div style={styles.badgeError}>Transaction Not Found</div>
          <h1 style={styles.heading}>Invalid Transaction Link</h1>
          <p style={styles.subtext}>{data.message || "Unable to locate fulfillment record."}</p>
        </div>
      </main>
    );
  }

  const req = data.request;

  return (
    <main className="garage-page-shell fulfillment-page-shell" style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>SUPERCAR OWNERSHIP FULFILLMENT HUB</div>
          <h1 style={styles.title}>
            {req.requestType.replace("_", " ")} — {req.status}
          </h1>
        </div>
        <div style={styles.statusBadge}>{req.status}</div>
      </div>

      <div className="fulfillment-main-grid" style={styles.mainGrid}>
        {/* Left Column: Transaction Details & Event Audit Log */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {req.requestType === "SERVICE_BOOKING" &&
            ["PAYMENT_REQUIRED", "PROCESSING", "FAILED"].includes(req.paymentStatus) &&
            ["READY_TO_SEND", "PAYMENT_PROCESSING", "ACCEPTED_AWAITING_PAYMENT"].includes(req.status) && (
            <div style={styles.paymentCard}>
              <div style={styles.paymentTag}>Payment required</div>
              <h2 style={styles.paymentTitle}>Confirm your service booking</h2>
              <p style={styles.paymentCopy}>
                Pay the SUPERCAR DASH booking fee to send the request to the service shop.
                Service or repair invoices remain payable directly to the shop.
              </p>
              <form method="post" action="/api/payments/service-booking-checkout" style={styles.paymentForm}>
                <input type="hidden" name="fulfillmentRequestId" value={req.id} />
                <input type="hidden" name="returnTo" value={`/fulfillment/buyer/${token}`} />
                <button type="submit" style={styles.payButton}>
                  Pay booking fee
                </button>
              </form>
            </div>
          )}

          {req.requestType === "SERVICE_BOOKING" && req.status === "CONFIRMED" && (
            <div style={styles.confirmedCard}>
              <div style={styles.paymentTag}>Booking confirmed</div>
              <h2 style={styles.paymentTitle}>Payment received</h2>
              <p style={styles.paymentCopy}>
                Your SUPERCAR DASH booking fee is paid and the service booking is confirmed.
              </p>
            </div>
          )}

          {req.vehicle && (
            <div style={styles.card}>
              <div style={styles.sectionTag}>VEHICLE DETAILS</div>
              <h2 style={styles.vehicleTitle}>
                {req.vehicle.year} {req.vehicle.model.make.name} {req.vehicle.model.name}
              </h2>
              {req.vehicle.trim && <div style={styles.vehicleSub}>{req.vehicle.trim}</div>}
              <div style={styles.vinTag}>VIN: {req.vehicle.vin}</div>
            </div>
          )}

          <div style={styles.card}>
            <div style={styles.sectionTag}>FULFILLMENT AUDIT LOG & EVENT TIMELINE</div>
            <div style={styles.timeline}>
              {req.events.map((event) => (
                <div key={event.id} style={styles.timelineItem}>
                  <div style={styles.timelineMarker} />
                  <div style={styles.timelineContent}>
                    <div style={styles.timelineHeader}>
                      <span style={styles.timelineStatus}>
                        {event.previousStatus ? `${event.previousStatus} → ` : ""}
                        {event.newStatus}
                      </span>
                      <span style={styles.timelineTime}>
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {event.note && <div style={styles.timelineNote}>{event.note}</div>}
                    <div style={styles.timelineActor}>
                      Actor: {event.actorType} {event.actorId ? `(${event.actorId})` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Parties, Fees & Deposit Hold */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {req.depositIntents.length > 0 && (
            <div style={styles.card}>
              <div style={styles.sectionTag}>DEPOSIT AUTHORIZATION HOLD</div>
              {req.depositIntents.map((deposit) => (
                <div key={deposit.id} style={styles.depositBox}>
                  <div style={styles.depositAmount}>
                    ${deposit.amount.toLocaleString()} {deposit.currency}
                  </div>
                  <div style={styles.depositStatusBadge}>{deposit.status}</div>
                  <p style={styles.depositSubtext}>
                    {deposit.status === "AUTHORIZED" || deposit.status === "HELD"
                      ? "Funds are authorized but NOT captured. Capture occurs only upon partner acceptance."
                      : deposit.status === "CAPTURED"
                      ? "Deposit captured following partner acceptance."
                      : "Deposit hold released."}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div style={styles.card}>
            <div style={styles.sectionTag}>PARTICIPATING PARTIES</div>
            <div style={styles.partiesList}>
              {req.parties.length === 0 ? (
                <div style={styles.subtext}>No parties assigned yet.</div>
              ) : (
                req.parties.map((party) => (
                  <div key={party.id} style={styles.partyCard}>
                    <div style={styles.partyRole}>{party.partyType}</div>
                    <div style={styles.partyName}>{party.name}</div>
                    {party.companyName && (
                      <div style={styles.partyCompany}>{party.companyName}</div>
                    )}
                    {party.email && <div style={styles.partyDetail}>{party.email}</div>}
                  </div>
                ))
              )}
            </div>
          </div>

          {req.fees.length > 0 && (
            <div style={styles.card}>
              <div style={styles.sectionTag}>ESTIMATED / AUTHORIZED FEES</div>
              {req.fees.map((fee) => (
                <div key={fee.id} style={styles.feeRow}>
                  <div>
                    <div style={styles.feeType}>{fee.feeType}</div>
                    {fee.description && (
                      <div style={styles.feeSub}>{fee.description}</div>
                    )}
                  </div>
                  <div style={styles.feeAmount}>
                    ${fee.amount.toLocaleString()} ({fee.status})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "transparent",
    color: "#ffffff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    width: "min(1360px, 100%)",
    margin: "0 auto 8px",
    paddingBottom: "16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
  },
  headerTitle: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    color: "rgba(255, 255, 255, 0.58)",
    marginBottom: "4px",
  },
  title: {
    fontSize: "24px",
    fontWeight: 800,
    color: "#ffffff",
  },
  statusBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    color: "#38BDF8",
    padding: "6px 16px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: 700,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 400px",
    gap: "24px",
    width: "min(1360px, 100%)",
    margin: "0 auto",
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: "8px",
    padding: "24px",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.22)",
    backdropFilter: "blur(18px)",
  },
  paymentCard: {
    backgroundColor: "#FEF3C7",
    borderRadius: "8px",
    padding: "24px",
    border: "1px solid #F59E0B",
    color: "#111827",
  },
  confirmedCard: {
    backgroundColor: "#D1FAE5",
    borderRadius: "8px",
    padding: "24px",
    border: "1px solid #10B981",
    color: "#111827",
  },
  paymentTag: {
    color: "#92400E",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "1px",
    textTransform: "uppercase",
    marginBottom: "10px",
  },
  paymentTitle: {
    color: "#111827",
    fontSize: "22px",
    fontWeight: 850,
    margin: "0 0 8px",
  },
  paymentCopy: {
    color: "#374151",
    fontSize: "14px",
    lineHeight: 1.55,
    margin: 0,
  },
  paymentForm: {
    marginTop: "16px",
  },
  payButton: {
    width: "100%",
    border: 0,
    borderRadius: "8px",
    backgroundColor: "#e20f1b",
    color: "#FFFFFF",
    padding: "13px 16px",
    fontSize: "14px",
    fontWeight: 850,
    cursor: "pointer",
  },
  sectionTag: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1px",
    color: "rgba(255, 255, 255, 0.5)",
    marginBottom: "16px",
  },
  vehicleTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#ffffff",
  },
  vehicleSub: {
    fontSize: "14px",
    color: "rgba(255, 255, 255, 0.62)",
    marginTop: "4px",
  },
  vinTag: {
    display: "inline-block",
    marginTop: "12px",
    padding: "4px 8px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#D1D5DB",
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    position: "relative",
    paddingLeft: "16px",
    borderLeft: "2px solid #1F2937",
  },
  timelineItem: {
    position: "relative",
  },
  timelineMarker: {
    position: "absolute",
    left: "-21px",
    top: "4px",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: "#3B82F6",
  },
  timelineContent: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: "8px",
    padding: "12px",
  },
  timelineHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "4px",
  },
  timelineStatus: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#60A5FA",
  },
  timelineTime: {
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.62)",
  },
  timelineNote: {
    fontSize: "13px",
    color: "rgba(255, 255, 255, 0.82)",
    marginBottom: "4px",
  },
  timelineActor: {
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.5)",
  },
  depositBox: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  depositAmount: {
    fontSize: "22px",
    fontWeight: 800,
    color: "#86efac",
  },
  depositStatusBadge: {
    display: "inline-block",
    backgroundColor: "#065F46",
    color: "#A7F3D0",
    padding: "4px 10px",
    borderRadius: "8px",
    fontSize: "11px",
    fontWeight: 700,
    width: "fit-content",
  },
  depositSubtext: {
    fontSize: "12px",
    color: "rgba(255, 255, 255, 0.62)",
    lineHeight: "1.4",
  },
  partiesList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  partyCard: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: "8px",
    padding: "12px",
  },
  partyRole: {
    fontSize: "10px",
    fontWeight: 700,
    color: "#3B82F6",
    letterSpacing: "0.5px",
    marginBottom: "2px",
  },
  partyName: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#ffffff",
  },
  partyCompany: {
    fontSize: "12px",
    color: "rgba(255, 255, 255, 0.62)",
  },
  partyDetail: {
    fontSize: "12px",
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: "2px",
  },
  feeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  },
  feeType: {
    fontSize: "13px",
    fontWeight: 600,
    color: "rgba(255, 255, 255, 0.82)",
  },
  feeSub: {
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.5)",
  },
  feeAmount: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#86efac",
  },
  badgeError: {
    display: "inline-block",
    backgroundColor: "#7F1D1D",
    color: "#FECACA",
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 700,
    marginBottom: "12px",
  },
  heading: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#ffffff",
    marginBottom: "8px",
  },
  subtext: {
    fontSize: "13px",
    color: "rgba(255, 255, 255, 0.66)",
  },
};
