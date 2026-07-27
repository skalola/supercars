"use client";

/**
 * components/admin/AdminOpsCenterClient.tsx
 *
 * Sprint 8.0 Internal Operations Review Layer Client Component.
 * Features KPI metrics dashboard, tabbed operational filters,
 * detailed request audit log rows, and operational controls (Resend Email, Cancel/Refund, Mark Completed).
 */

import React, { useState } from "react";
import Link from "next/link";
import {
  resendEmailAction,
  adminCancelAction,
  adminCompleteAction,
  adminProcessExpiredAction,
  adminReleaseRefundAction,
} from "@/app/actions/admin";
import { AdminFulfillmentMetrics, AdminFilterTab } from "@/lib/admin/fulfillment-ops";

export interface AdminFulfillmentItem {
  id: string;
  publicTransactionToken: string;
  requestType: string;
  status: string;
  paymentStatus: string;
  expectedPlatformFee: number;
  expectedPartnerCommission: number;
  collectedAmount: number;
  refundableAmount: number;
  payoutStatus: string;
  cancellationReason?: string | null;
  cancelledByActor?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  vehicle?: {
    id: string;
    year: number;
    make: string;
    model: string;
    trim?: string | null;
    vin: string;
    image?: string | null;
  } | null;
  parties?: Array<{
    id: string;
    partyType: string;
    name: string;
    email?: string | null;
    companyName?: string | null;
  }>;
  fees?: Array<{
    id: string;
    feeType: string;
    amount: number;
    status: string;
  }>;
  depositIntents?: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
  }>;
  partnerTokens?: Array<{
    id: string;
    token: string;
    partnerName?: string | null;
    partnerEmail?: string | null;
    expiresAt?: string | Date | null;
    actionTaken?: string | null;
  }>;
  events?: Array<{
    id: string;
    createdAt: string | Date;
    actorType: string;
    newStatus: string;
    note?: string | null;
    metadata?: string | null;
  }>;
}

interface AdminOpsCenterClientProps {
  metrics: AdminFulfillmentMetrics;
  requests: AdminFulfillmentItem[];
}

export function AdminOpsCenterClient({ metrics, requests }: AdminOpsCenterClientProps) {
  const [activeTab, setActiveTab] = useState<AdminFilterTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionMessage, setActionMessage] = useState<{ id: string; msg: string; type: "success" | "error" } | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [isProcessingExpired, setIsProcessingExpired] = useState(false);

  // Client-side filtering
  const filteredRequests = requests.filter((req) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const idMatch = req.id.toLowerCase().includes(q);
      const vinMatch = req.vehicle?.vin.toLowerCase().includes(q);
      const makeMatch = req.vehicle?.make.toLowerCase().includes(q);
      const modelMatch = req.vehicle?.model.toLowerCase().includes(q);
      const partyMatch = req.parties?.some((p) => p.name.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));
      if (!idMatch && !vinMatch && !makeMatch && !modelMatch && !partyMatch) return false;
    }

    switch (activeTab) {
      case "STUCK_EXPIRED":
        return req.status === "EXPIRED" || req.status === "DRAFT";
      case "ACCEPTED":
        return req.status === "ACCEPTED";
      case "DECLINED":
        return req.status === "DECLINED";
      case "PENDING_REFUNDS":
        return hasRefundOrSettlementAttention(req);
      case "FAILED_EMAILS":
        return req.events?.some((e) => e.note?.includes("HELD") || e.note?.includes("BLOCKED") || e.note?.includes("UNRESOLVED"));
      case "ALL":
      default:
        return true;
    }
  });

  // Action handlers
  const handleResend = async (requestId: string) => {
    setIsProcessing(requestId);
    setActionMessage(null);
    const res = await resendEmailAction(requestId);
    setIsProcessing(null);
    setActionMessage({
      id: requestId,
      msg: res.message,
      type: res.success ? "success" : "error",
    });
  };

  const handleCancelAndRefund = async (requestId: string) => {
    const reason = prompt("Enter admin cancellation reason:", "Administrative manual cancellation & refund.");
    if (reason === null) return;

    setIsProcessing(requestId);
    setActionMessage(null);
    const res = await adminCancelAction(requestId, reason);
    setIsProcessing(null);
    setActionMessage({
      id: requestId,
      msg: res.message,
      type: res.success ? "success" : "error",
    });
  };

  const handleMarkCompleted = async (requestId: string) => {
    const note = prompt("Enter completion reconciliation note:", "Admin verified offline fulfillment completion.");
    if (note === null) return;

    setIsProcessing(requestId);
    setActionMessage(null);
    const res = await adminCompleteAction(requestId, note);
    setIsProcessing(null);
    setActionMessage({
      id: requestId,
      msg: res.message,
      type: res.success ? "success" : "error",
    });
  };

  const handleReleaseRefund = async (requestId: string) => {
    const note = prompt("Enter release/refund reconciliation note:", "Admin reconciled outstanding payment hold or refund.");
    if (note === null) return;

    setIsProcessing(requestId);
    setActionMessage(null);
    const res = await adminReleaseRefundAction(requestId, note);
    setIsProcessing(null);
    setActionMessage({
      id: requestId,
      msg: res.message,
      type: res.success ? "success" : "error",
    });
  };

  const handleProcessExpired = async () => {
    setIsProcessingExpired(true);
    setActionMessage(null);
    const res = await adminProcessExpiredAction();
    setIsProcessingExpired(false);
    setActionMessage({
      id: "global",
      msg: res.message,
      type: res.success ? "success" : "error",
    });
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.badgeLabel}>SUPERCARS INTERNAL OPERATIONS</div>
          <h1 style={styles.title}>Fulfillment Review & Control Center</h1>
          <p style={styles.subtitle}>
            Enterprise administrative control layer for stuck requests, partner contact auditing, financial reconciliation, and manual overrides.
          </p>
        </div>
        <div style={styles.headerActions}>
          <button
            type="button"
            onClick={handleProcessExpired}
            disabled={isProcessingExpired}
            style={{
              ...styles.headerActionBtn,
              ...(isProcessingExpired ? styles.disabledActionBtn : {}),
            }}
          >
            {isProcessingExpired ? "Processing..." : "Process Expired Links"}
          </button>
          <div style={styles.adminBadge}>ADMIN CONTROL ACTIVE</div>
        </div>
      </div>

      {actionMessage?.id === "global" && (
        <div
          style={{
            ...styles.globalActionMessage,
            ...(actionMessage.type === "success" ? styles.globalActionSuccess : styles.globalActionError),
          }}
        >
          {actionMessage.msg}
        </div>
      )}

      {/* KPI Metrics Dashboard Bar */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>TOTAL REQUESTS</div>
          <div style={styles.kpiValue}>{metrics.totalRequests}</div>
          <div style={styles.kpiSub}>All Time Volume</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>ACCEPTED / DECLINED</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "#10B981" }}>{metrics.acceptedCount}</span>
            <span style={{ color: "#64748B" }}>/</span>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "#EF4444" }}>{metrics.declinedCount}</span>
          </div>
          <div style={styles.kpiSub}>Partner Decision Ratio</div>
        </div>

        <div style={{ ...styles.kpiCard, ...(metrics.stuckOrExpiredCount > 0 ? styles.kpiCardWarn : {}) }}>
          <div style={styles.kpiLabel}>STUCK / EXPIRED</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: metrics.stuckOrExpiredCount > 0 ? "#D97706" : "#0F172A" }}>
            {metrics.stuckOrExpiredCount}
          </div>
          <div style={styles.kpiSub}>Draft Holds & Token Expirations</div>
        </div>

        <div style={{ ...styles.kpiCard, ...(metrics.failedEmailsCount > 0 ? styles.kpiCardDanger : {}) }}>
          <div style={styles.kpiLabel}>FAILED / HELD EMAILS</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: metrics.failedEmailsCount > 0 ? "#DC2626" : "#0F172A" }}>
            {metrics.failedEmailsCount}
          </div>
          <div style={styles.kpiSub}>Zero Guessed Email Blocked Sends</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>COLLECTED COMMISSION</div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#10B981" }}>
            ${metrics.totalCommissionCollected.toLocaleString()}
          </div>
          <div style={styles.kpiSub}>Expected: ${metrics.totalCommissionExpected.toLocaleString()}</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>PARTNER CONFIDENCE</div>
          <div style={{ fontSize: "12px", color: "#334155", fontWeight: 700, marginTop: "4px" }}>
            <span style={{ color: "#10B981" }}>{metrics.partnerConfidence.verified} Verified</span> &middot;{" "}
            <span style={{ color: "#2563EB" }}>{metrics.partnerConfidence.publicSource} Public</span> &middot;{" "}
            <span style={{ color: "#DC2626" }}>{metrics.partnerConfidence.unresolvedEmail} Unresolved</span>
          </div>
          <div style={styles.kpiSub}>Audited Partner Registry</div>
        </div>
      </div>

      {/* Tab Filter Buttons */}
      <div style={styles.tabContainer}>
        {(
          [
            { id: "ALL", label: "All Requests", count: metrics.totalRequests },
            { id: "STUCK_EXPIRED", label: "Stuck / Expired", count: metrics.stuckOrExpiredCount },
            { id: "ACCEPTED", label: "Accepted", count: metrics.acceptedCount },
            { id: "DECLINED", label: "Declined", count: metrics.declinedCount },
            { id: "PENDING_REFUNDS", label: "Refunds & Settlement", count: metrics.pendingRefundsCount },
            { id: "FAILED_EMAILS", label: "Email Holds / Failures", count: metrics.failedEmailsCount },
          ] as Array<{ id: AdminFilterTab; label: string; count: number }>
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.tabBtn,
                ...(isActive ? styles.activeTabBtn : {}),
              }}
            >
              {tab.label}
              <span style={{ ...styles.tabBadge, ...(isActive ? styles.activeTabBadge : {}) }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Input Bar */}
      <div style={styles.searchBar}>
        <input
          type="text"
          placeholder="Search by Request ID, VIN, Make, Model, or Partner Email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} style={styles.clearBtn}>
            Clear
          </button>
        )}
      </div>

      {/* Operations Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.th}>REQUEST ID / TYPE</th>
              <th style={styles.th}>VEHICLE & VIN</th>
              <th style={styles.th}>PARTIES & PARTNER</th>
              <th style={styles.th}>STATUS & PAYMENT</th>
              <th style={styles.th}>LAST AUDIT EVENT</th>
              <th style={styles.th}>FINANCIALS</th>
              <th style={styles.th}>ADMIN ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#64748B" }}>
                  No fulfillment requests match the selected filter.
                </td>
              </tr>
            ) : (
              filteredRequests.map((req) => {
                const partner = req.parties?.find((p) => p.partyType !== "BUYER" && p.partyType !== "SELLER" && p.partyType !== "PLATFORM");
                const buyer = req.parties?.find((p) => p.partyType === "BUYER");
                const latestEvent = req.events?.[0];
                const isBusy = isProcessing === req.id;
                const msg = actionMessage?.id === req.id ? actionMessage : null;
                const canCancel = !["DECLINED", "EXPIRED", "CANCELLED", "COMPLETED"].includes(req.status);
                const canComplete = req.status === "ACCEPTED";
                const canReleaseRefund = hasRefundOrSettlementAttention(req);
                const latestAuditContext = getAuditContextSummary(latestEvent?.metadata);

                return (
                  <tr key={req.id} style={styles.tableRow}>
                    {/* 1. Request ID & Type */}
                    <td style={styles.td}>
                      <div style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: "#2563EB" }}>
                        {req.id.slice(0, 13)}...
                      </div>
                      <span style={getTypeBadgeStyle(req.requestType)}>
                        {req.requestType.replace("_", " ")}
                      </span>
                    </td>

                    {/* 2. Vehicle & VIN */}
                    <td style={styles.td}>
                      {req.vehicle ? (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "13px", color: "#0F172A" }}>
                            {req.vehicle.year} {req.vehicle.make} {req.vehicle.model}
                          </div>
                          <Link href={`/vehicle/${req.vehicle.vin}`} style={styles.vinLink}>
                            VIN: {req.vehicle.vin}
                          </Link>
                        </div>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#94A3B8" }}>No Vehicle Attached</span>
                      )}
                    </td>

                    {/* 3. Parties & Partner */}
                    <td style={styles.td}>
                      <div style={{ fontWeight: 700, fontSize: "13px", color: "#1E293B" }}>
                        {partner?.name || "Unresolved Partner"}
                      </div>
                      {partner?.email ? (
                        <div style={{ fontSize: "11px", color: "#10B981" }}>{partner.email}</div>
                      ) : (
                        <div style={{ fontSize: "11px", color: "#EF4444", fontWeight: 700 }}>⚠️ UNRESOLVED EMAIL</div>
                      )}
                      <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
                        Buyer: {buyer?.name || "N/A"}
                      </div>
                    </td>

                    {/* 4. Status & Payment */}
                    <td style={styles.td}>
                      <span style={getStatusBadgeStyle(req.status)}>{req.status}</span>
                      <div style={{ marginTop: "4px" }}>
                        <span style={getPaymentBadgeStyle(req.paymentStatus)}>{req.paymentStatus}</span>
                      </div>
                    </td>

                    {/* 5. Last Audit Event */}
                    <td style={styles.td}>
                      <div style={{ fontSize: "12px", color: "#334155", fontWeight: 600 }}>
                        {new Date(latestEvent?.createdAt || req.updatedAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ({new Date(latestEvent?.createdAt || req.updatedAt).toLocaleDateString()})
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px", maxWidth: "180px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {latestEvent?.note || latestEvent?.newStatus || "Request created"}
                      </div>
                      {latestAuditContext && (
                        <div style={styles.auditMeta}>{latestAuditContext}</div>
                      )}
                    </td>

                    {/* 6. Financials */}
                    <td style={styles.td}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#0F172A" }}>
                        Coll: ${req.collectedAmount.toLocaleString()}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748B" }}>
                        Exp: ${(req.expectedPlatformFee + req.expectedPartnerCommission).toLocaleString()}
                      </div>
                    </td>

                    {/* 7. Admin Actions */}
                    <td style={styles.td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "120px" }}>
                        <button
                          disabled={isBusy}
                          onClick={() => handleResend(req.id)}
                          style={styles.actionBtnResend}
                        >
                          Resend Email
                        </button>

                        {canCancel && (
                          <button
                            disabled={isBusy}
                            onClick={() => handleCancelAndRefund(req.id)}
                            style={styles.actionBtnCancel}
                          >
                            Cancel / Refund
                          </button>
                        )}

                        {canComplete && (
                          <button
                            disabled={isBusy}
                            onClick={() => handleMarkCompleted(req.id)}
                            style={styles.actionBtnComplete}
                          >
                            Complete
                          </button>
                        )}

                        {canReleaseRefund && (
                          <button
                            disabled={isBusy}
                            onClick={() => handleReleaseRefund(req.id)}
                            style={styles.actionBtnRefund}
                          >
                            Release / Refund
                          </button>
                        )}

                        <Link href={`/transactions/${req.publicTransactionToken}`} style={styles.actionBtnHub}>
                          View Hub
                        </Link>
                      </div>

                      {msg && (
                        <div
                          style={{
                            marginTop: "6px",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: msg.type === "success" ? "#10B981" : "#EF4444",
                          }}
                        >
                          {msg.msg}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function hasRefundOrSettlementAttention(req: AdminFulfillmentItem) {
  return (
    req.payoutStatus === "PENDING_RECONCILIATION" ||
    ["AUTHORIZATION_PENDING", "AUTHORIZED", "CAPTURE_PENDING", "CAPTURED"].includes(req.paymentStatus) ||
    Boolean(req.depositIntents?.some((d) => ["AUTHORIZED", "HELD", "CAPTURED"].includes(d.status))) ||
    Boolean(req.fees?.some((f) => ["AUTHORIZED", "CAPTURED"].includes(f.status)))
  );
}

function getAuditContextSummary(metadata?: string | null) {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as {
      auditContext?: {
        submittedVia?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
      } | null;
    };
    const context = parsed.auditContext;
    if (!context) return null;

    const pieces = [
      context.submittedVia,
      context.ipAddress ? `IP ${context.ipAddress}` : null,
      context.userAgent ? context.userAgent.split(" ")[0] : null,
    ].filter(Boolean);

    return pieces.length ? pieces.join(" · ") : null;
  } catch {
    return null;
  }
}

// Styling Helper Functions
function getTypeBadgeStyle(type: string): React.CSSProperties {
  switch (type) {
    case "DEALER_PURCHASE":
      return { backgroundColor: "#DBEAFE", color: "#1E40AF", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    case "INSURANCE_QUOTE":
      return { backgroundColor: "#D1FAE5", color: "#065F46", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    case "TRANSPORT_QUOTE":
      return { backgroundColor: "#FEF3C7", color: "#92400E", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    case "SERVICE_BOOKING":
      return { backgroundColor: "#F3E8FF", color: "#6B21A8", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    default:
      return { backgroundColor: "#F1F5F9", color: "#475569", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
  }
}

function getStatusBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "ACCEPTED":
    case "COMPLETED":
      return { backgroundColor: "#10B981", color: "#FFFFFF", padding: "3px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 800 };
    case "SENT":
    case "VIEWED":
      return { backgroundColor: "#3B82F6", color: "#FFFFFF", padding: "3px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 800 };
    case "DRAFT":
      return { backgroundColor: "#F59E0B", color: "#FFFFFF", padding: "3px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 800 };
    case "DECLINED":
    case "CANCELLED":
    case "EXPIRED":
      return { backgroundColor: "#EF4444", color: "#FFFFFF", padding: "3px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 800 };
    default:
      return { backgroundColor: "#64748B", color: "#FFFFFF", padding: "3px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 800 };
  }
}

function getPaymentBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case "CAPTURED":
      return { backgroundColor: "#065F46", color: "#D1FAE5", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    case "AUTHORIZED":
      return { backgroundColor: "#1E40AF", color: "#DBEAFE", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    case "REFUNDED":
    case "VOIDED":
      return { backgroundColor: "#991B1B", color: "#FEE2E2", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    default:
      return { backgroundColor: "#475569", color: "#F1F5F9", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
    padding: "32px 24px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "24px",
    borderBottom: "1px solid #E2E8F0",
    paddingBottom: "16px",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  headerActionBtn: {
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    border: "1px solid #CBD5E1",
    borderRadius: "6px",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  disabledActionBtn: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  globalActionMessage: {
    borderRadius: "6px",
    padding: "10px 12px",
    fontSize: "12px",
    fontWeight: 700,
    marginBottom: "16px",
  },
  globalActionSuccess: {
    border: "1px solid #86EFAC",
    backgroundColor: "#F0FDF4",
    color: "#166534",
  },
  globalActionError: {
    border: "1px solid #FCA5A5",
    backgroundColor: "#FEF2F2",
    color: "#991B1B",
  },
  badgeLabel: {
    fontSize: "11px",
    fontWeight: 800,
    color: "#DC2626",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
  },
  title: {
    fontSize: "28px",
    fontWeight: 800,
    color: "#0F172A",
    margin: "4px 0 8px 0",
  },
  subtitle: {
    fontSize: "14px",
    color: "#475569",
    margin: 0,
  },
  adminBadge: {
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "1px",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  kpiCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: "10px",
    border: "1px solid #E2E8F0",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  kpiCardWarn: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  kpiCardDanger: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  kpiLabel: {
    fontSize: "11px",
    fontWeight: 800,
    color: "#64748B",
    letterSpacing: "0.5px",
  },
  kpiValue: {
    fontSize: "24px",
    fontWeight: 800,
    color: "#0F172A",
    margin: "4px 0",
  },
  kpiSub: {
    fontSize: "11px",
    color: "#64748B",
  },
  tabContainer: {
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    paddingBottom: "8px",
    marginBottom: "16px",
    borderBottom: "1px solid #E2E8F0",
  },
  tabBtn: {
    padding: "8px 14px",
    borderRadius: "6px",
    border: "1px solid #E2E8F0",
    backgroundColor: "#FFFFFF",
    color: "#475569",
    fontWeight: 600,
    fontSize: "13px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
  },
  activeTabBtn: {
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    borderColor: "#0F172A",
  },
  tabBadge: {
    backgroundColor: "#F1F5F9",
    color: "#475569",
    fontSize: "11px",
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: "999px",
  },
  activeTabBadge: {
    backgroundColor: "#334155",
    color: "#FFFFFF",
  },
  searchBar: {
    display: "flex",
    gap: "8px",
    marginBottom: "20px",
  },
  searchInput: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #CBD5E1",
    fontSize: "14px",
    outline: "none",
  },
  clearBtn: {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "1px solid #CBD5E1",
    backgroundColor: "#F8FAFC",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
  },
  tableContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: "10px",
    border: "1px solid #E2E8F0",
    overflowX: "auto",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  tableHeaderRow: {
    backgroundColor: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
  },
  th: {
    padding: "12px 14px",
    fontSize: "11px",
    fontWeight: 800,
    color: "#64748B",
    letterSpacing: "0.5px",
  },
  tableRow: {
    borderBottom: "1px solid #F1F5F9",
  },
  td: {
    padding: "12px 14px",
    verticalAlign: "top",
  },
  vinLink: {
    fontSize: "11px",
    color: "#2563EB",
    textDecoration: "none",
  },
  auditMeta: {
    marginTop: "4px",
    fontSize: "10px",
    color: "#0F766E",
    backgroundColor: "#ECFDF5",
    border: "1px solid #A7F3D0",
    borderRadius: "4px",
    padding: "3px 5px",
    maxWidth: "180px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  actionBtnResend: {
    backgroundColor: "#2563EB",
    color: "#FFFFFF",
    border: "none",
    padding: "5px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionBtnCancel: {
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    border: "none",
    padding: "5px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionBtnComplete: {
    backgroundColor: "#10B981",
    color: "#FFFFFF",
    border: "none",
    padding: "5px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionBtnRefund: {
    backgroundColor: "#7C3AED",
    color: "#FFFFFF",
    border: "none",
    padding: "5px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionBtnHub: {
    backgroundColor: "#F1F5F9",
    color: "#334155",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 700,
    textDecoration: "none",
    textAlign: "center",
  },
};
