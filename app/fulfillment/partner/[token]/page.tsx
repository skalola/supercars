import React from "react";
import { getPartnerFulfillmentPackage, submitPartnerDecision } from "@/lib/fulfillment/service";
import { revalidatePath } from "next/cache";

interface PartnerPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function PartnerFulfillmentPage({ params }: PartnerPageProps) {
  const { token } = await params;
  const data = await getPartnerFulfillmentPackage(token);

  if ("error" in data) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.badgeError}>Access Error</div>
          <h1 style={styles.heading}>Link Invalid or Expired</h1>
          <p style={styles.subtext}>{data.message}</p>
        </div>
      </div>
    );
  }

  const { request, actionTaken, actionTakenAt } = data;

  async function handleDecisionAction(formData: FormData) {
    "use server";
    const decision = formData.get("decision") as "ACCEPTED" | "DECLINED";
    const note = formData.get("note") as string;
    await submitPartnerDecision({ token, decision, note });
    revalidatePath(`/fulfillment/partner/${token}`);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>SUPERCAR DASH FULFILLMENT PORTAL</div>
        <div style={styles.statusBadge}>{request.status}</div>
      </div>

      <div style={styles.mainGrid}>
        {/* Left Column: Scoped Package Details */}
        <div style={styles.card}>
          <div style={styles.sectionTag}>AUTHORIZED SCOPED PACKAGE</div>
          <h2 style={styles.title}>{request.package.title}</h2>
          {request.package.description && (
            <p style={styles.description}>{request.package.description}</p>
          )}

          <div style={styles.scopeBox}>
            <div style={styles.scopeHeader}>Authorized Scope Only</div>
            <div style={styles.scopeGrid}>
              {Object.entries(request.package.scopedData).map(([key, val]) => (
                <ScopeField key={key} label={camelToTitleCase(key)} value={val} />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Vehicle Summary & Decision Form */}
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
                Funds are authorized and held. No money is captured until this fulfillment request is accepted.
              </p>
            </div>
          )}

          <div style={styles.card}>
            <div style={styles.sectionTag}>PARTNER DECISION</div>

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
                  {actionTakenAt
                    ? new Date(actionTakenAt).toLocaleString()
                    : "record"}
                </div>
              </div>
            ) : (
              <form action={handleDecisionAction} style={styles.form}>
                <label style={styles.label}>
                  Partner Notes (Optional)
                  <textarea
                    name="note"
                    placeholder="Add confirmation details, reference numbers, or notes..."
                    rows={3}
                    style={styles.textarea}
                  />
                </label>

                <div style={styles.buttonGroup}>
                  <button
                    type="submit"
                    name="decision"
                    value="ACCEPTED"
                    style={styles.acceptButton}
                  >
                    Accept Fulfillment Request
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="DECLINED"
                    style={styles.declineButton}
                  >
                    Decline Request
                  </button>
                </div>
              </form>
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
    .replace(/_/g, " ")
    .replace(/^./, (s) => s.toUpperCase());
}

function ScopeField({ label, value }: { label: string; value: unknown }) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (
      <section style={styles.scopeSection}>
        <h3 style={styles.scopeSectionTitle}>{label}</h3>
        <div style={styles.scopeNestedGrid}>
          {Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => (
            <ScopeField key={key} label={camelToTitleCase(key)} value={nestedValue} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div style={styles.scopeItem}>
      <div style={styles.scopeKey}>{label}</div>
      <div style={styles.scopeValue}>{formatScopeValue(value)}</div>
    </div>
  );
}

function formatScopeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatScopeValue).join(", ") : "None";
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => `${camelToTitleCase(key)}: ${formatScopeValue(nestedValue)}`)
      .join("; ");
  }
  return String(value);
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    padding: "clamp(18px, 4vw, 32px)",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "32px",
    paddingBottom: "16px",
    borderBottom: "1px solid #1E293B",
  },
  headerTitle: {
    fontSize: "12px",
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
    letterSpacing: "0.5px",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
    gap: "24px",
    alignItems: "start",
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: "12px",
    padding: "clamp(18px, 3vw, 24px)",
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
    padding: "clamp(14px, 3vw, 18px)",
    border: "1px solid #334155",
  },
  scopeHeader: {
    fontSize: "12px",
    fontWeight: 800,
    color: "#CBD5E1",
    marginBottom: "14px",
  },
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
    gap: "12px",
  },
  scopeSection: {
    gridColumn: "1 / -1",
    backgroundColor: "#111C2E",
    border: "1px solid #26364D",
    borderRadius: "8px",
    padding: "14px",
  },
  scopeSectionTitle: {
    color: "#F8FAFC",
    fontSize: "15px",
    fontWeight: 800,
    margin: "0 0 12px",
  },
  scopeNestedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
    gap: "10px",
  },
  scopeItem: {
    minWidth: 0,
    backgroundColor: "#172236",
    border: "1px solid #26364D",
    borderRadius: "8px",
    padding: "12px",
  },
  scopeKey: {
    fontSize: "11px",
    color: "#94A3B8",
    fontWeight: 800,
    textTransform: "uppercase",
    marginBottom: "6px",
  },
  scopeValue: {
    fontSize: "14px",
    color: "#F8FAFC",
    fontWeight: 600,
    lineHeight: 1.45,
    overflowWrap: "anywhere",
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
    lineHeight: "1.5",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    marginTop: "12px",
  },
  label: {
    fontSize: "13px",
    color: "#CBD5E1",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  textarea: {
    backgroundColor: "#0F172A",
    border: "1px solid #334155",
    borderRadius: "8px",
    color: "#F8FAFC",
    padding: "10px",
    fontSize: "13px",
    fontFamily: "inherit",
    outline: "none",
  },
  buttonGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
  },
  acceptButton: {
    flex: 1,
    backgroundColor: "#10B981",
    color: "#FFFFFF",
    padding: "12px",
    borderRadius: "8px",
    border: "none",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
  },
  declineButton: {
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    padding: "12px 16px",
    borderRadius: "8px",
    border: "none",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
  },
  decisionSummary: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
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
