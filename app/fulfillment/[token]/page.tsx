import React from "react";
import { getPartnerFulfillmentPackage } from "@/lib/fulfillment/service";

interface PartnerTokenPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function PartnerTokenPage({ params }: PartnerTokenPageProps) {
  const { token } = await params;
  const data = await getPartnerFulfillmentPackage(token);

  if ("error" in data) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.badgeError}>Token Access Error</div>
          <h1 style={styles.heading}>
            {data.error === "TOKEN_EXPIRED" ? "Fulfillment Link Expired" : "Invalid Token Link"}
          </h1>
          <p style={styles.subtext}>{data.message}</p>
        </div>
      </div>
    );
  }

  const { request, actionTaken, actionTakenAt } = data;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>PARTNER SCOPED FULFILLMENT PORTAL</div>
        <div style={styles.statusBadge}>{request.status}</div>
      </div>

      <div style={styles.mainGrid}>
        {/* Left Column: Authorized Scoped Package Data */}
        <div style={styles.card}>
          <div style={styles.sectionTag}>AUTHORIZED SCOPED DATA PACKAGE</div>
          <h2 style={styles.title}>{request.package.title}</h2>
          {request.package.description && (
            <p style={styles.description}>{request.package.description}</p>
          )}

          <div style={styles.scopeBox}>
            <div style={styles.scopeHeader}>Package Payload (Authorized Scope Only)</div>
            <div style={styles.scopeGrid}>
              {Object.entries(request.package.scopedData).map(([key, val]) => (
                <div key={key} style={styles.scopeItem}>
                  <div style={styles.scopeKey}>{camelToTitleCase(key)}</div>
                  <div style={styles.scopeValue}>
                    {val === null || val === undefined ? (
                      "Not provided"
                    ) : typeof val === "object" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {Object.entries(val).map(([subKey, subVal]) => (
                          <div key={subKey} style={{ fontSize: "13px", lineHeight: "1.4" }}>
                            <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                              {camelToTitleCase(subKey)}:
                            </span>{" "}
                            <span style={{ color: "#f8fafc" }}>
                              {typeof subVal === "object" ? JSON.stringify(subVal) : String(subVal ?? "Not provided")}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      String(val)
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Vehicle Specs, Deposit Hold & Single-Purpose Token Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {request.vehicle && (
            <div style={styles.card}>
              <div style={styles.sectionTag}>VEHICLE SPECIFICATION</div>
              <h3 style={styles.vehicleTitle}>
                {request.vehicle.year} {request.vehicle.make} {request.vehicle.model}
              </h3>
              {request.vehicle.trim && (
                <div style={styles.vehicleSub}>{request.vehicle.trim}</div>
              )}
              <div style={styles.vinTag}>VIN: {request.vehicle.vin}</div>
            </div>
          )}

          {request.depositHold && (
            <div style={styles.card}>
              <div style={styles.sectionTag}>REFUNDABLE DEPOSIT / AUTHORIZATION HOLD</div>
              <div style={styles.depositRow}>
                <div style={styles.depositAmount}>
                  ${request.depositHold.amount.toLocaleString()} {request.depositHold.currency}
                </div>
                <div style={styles.holdBadge}>{request.depositHold.status}</div>
              </div>
              <p style={styles.depositNote}>
                Funds authorized and held. Captured ONLY upon partner acceptance.
              </p>
            </div>
          )}

          <div style={styles.card}>
            <div style={styles.sectionTag}>PARTNER DECISION (SINGLE-PURPOSE TOKEN)</div>

            {actionTaken ? (
              <div style={styles.decisionSummary}>
                <div
                  style={
                    actionTaken === "ACCEPTED"
                      ? styles.acceptedBadge
                      : styles.declinedBadge
                  }
                >
                  {actionTaken}
                </div>
                <div style={styles.subtext}>
                  Submitted on{" "}
                  {actionTakenAt ? new Date(actionTakenAt).toLocaleString() : "record"}
                </div>
                <div style={styles.singlePurposeNote}>
                  🔒 This single-purpose token has been finalized and cannot be reused.
                </div>
              </div>
            ) : (
              <div style={styles.actionBlock}>
                <p style={styles.actionNote}>
                  Select an action below to formally execute your fulfillment decision. Once submitted, this single-purpose link is finalized.
                </p>

                <div style={styles.buttonGroup}>
                  <a href={`/fulfillment/${token}/accept`} style={styles.acceptLink}>
                    ✓ Accept Request
                  </a>
                  <a href={`/fulfillment/${token}/decline`} style={styles.declineLink}>
                    ✗ Decline Request
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function camelToTitleCase(str: string): string {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase());
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    padding: "32px 24px",
    maxWidth: "1150px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "32px",
    paddingBottom: "16px",
    borderBottom: "1px solid #1E293B",
  },
  headerTitle: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    color: "#64748B",
  },
  statusBadge: {
    backgroundColor: "#1E293B",
    color: "#38BDF8",
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: 700,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 380px",
    gap: "24px",
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: "12px",
    padding: "24px",
    border: "1px solid #334155",
  },
  sectionTag: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "1px",
    color: "#94A3B8",
    marginBottom: "12px",
  },
  title: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#F8FAFC",
    marginBottom: "8px",
  },
  description: {
    fontSize: "14px",
    color: "#94A3B8",
    marginBottom: "20px",
  },
  scopeBox: {
    backgroundColor: "#0F172A",
    borderRadius: "8px",
    padding: "16px",
    border: "1px solid #334155",
  },
  scopeHeader: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#64748B",
    marginBottom: "12px",
  },
  scopeGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  scopeItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #1E293B",
  },
  scopeKey: {
    fontSize: "13px",
    color: "#94A3B8",
  },
  scopeValue: {
    fontSize: "14px",
    color: "#F8FAFC",
    fontWeight: 600,
  },
  vehicleTitle: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#F8FAFC",
  },
  vehicleSub: {
    fontSize: "14px",
    color: "#94A3B8",
    marginTop: "4px",
  },
  vinTag: {
    display: "inline-block",
    marginTop: "12px",
    padding: "4px 8px",
    backgroundColor: "#0F172A",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#CBD5E1",
  },
  depositRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  depositAmount: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#10B981",
  },
  holdBadge: {
    backgroundColor: "#065F46",
    color: "#A7F3D0",
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: 700,
  },
  depositNote: {
    fontSize: "12px",
    color: "#94A3B8",
    lineHeight: "1.4",
  },
  actionBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  actionNote: {
    fontSize: "13px",
    color: "#94A3B8",
    lineHeight: "1.4",
  },
  buttonGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  acceptLink: {
    display: "block",
    textAlign: "center",
    backgroundColor: "#10B981",
    color: "#FFFFFF",
    padding: "14px",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "14px",
    textDecoration: "none",
  },
  declineLink: {
    display: "block",
    textAlign: "center",
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    padding: "14px",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "14px",
    textDecoration: "none",
  },
  decisionSummary: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    padding: "16px 0",
  },
  acceptedBadge: {
    backgroundColor: "#065F46",
    color: "#34D399",
    padding: "8px 24px",
    borderRadius: "20px",
    fontSize: "16px",
    fontWeight: 800,
  },
  declinedBadge: {
    backgroundColor: "#7F1D1D",
    color: "#FCA5A5",
    padding: "8px 24px",
    borderRadius: "20px",
    fontSize: "16px",
    fontWeight: 800,
  },
  singlePurposeNote: {
    fontSize: "11px",
    color: "#64748B",
    marginTop: "8px",
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
    color: "#F8FAFC",
    marginBottom: "8px",
  },
  subtext: {
    fontSize: "13px",
    color: "#94A3B8",
  },
};
