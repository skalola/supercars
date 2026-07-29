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
import { useRouter } from "next/navigation";
import {
  resendEmailAction,
  adminCancelAction,
  adminCompleteAction,
  adminProcessExpiredAction,
  adminReleaseRefundAction,
  adminDeleteFulfillmentAction,
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminFilterTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [requestTypeFilter, setRequestTypeFilter] = useState("");
  const [actionMessage, setActionMessage] = useState<{ id: string; msg: string; type: "success" | "error" } | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [isProcessingExpired, setIsProcessingExpired] = useState(false);
  const requestTypeOptions = Array.from(new Set(requests.map((req) => req.requestType))).sort();

  // Client-side filtering
  const filteredRequests = requests.filter((req) => {
    if (requestTypeFilter && req.requestType !== requestTypeFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const idMatch = req.id.toLowerCase().includes(q);
      const typeMatch = formatRequestType(req.requestType).toLowerCase().includes(q);
      const vinMatch = req.vehicle?.vin.toLowerCase().includes(q);
      const makeMatch = req.vehicle?.make.toLowerCase().includes(q);
      const modelMatch = req.vehicle?.model.toLowerCase().includes(q);
      const partyMatch = req.parties?.some((p) => p.name.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));
      if (!idMatch && !typeMatch && !vinMatch && !makeMatch && !modelMatch && !partyMatch) return false;
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
    const confirmed = window.confirm(
      "Cancel this fulfillment request and release/refund any eligible payment holds? This will notify the transaction record and cannot be silently undone."
    );
    if (!confirmed) return;

    setIsProcessing(requestId);
    setActionMessage(null);
    const res = await adminCancelAction(requestId, "Admin confirmed cancellation and refund from fulfillment center.");
    setIsProcessing(null);
    setActionMessage({
      id: requestId,
      msg: res.message,
      type: res.success ? "success" : "error",
    });
    if (res.success) router.refresh();
  };

  const handleMarkCompleted = async (requestId: string) => {
    const confirmed = window.confirm(
      "Mark this accepted fulfillment request as completed and reconciled?"
    );
    if (!confirmed) return;

    setIsProcessing(requestId);
    setActionMessage(null);
    const res = await adminCompleteAction(requestId, "Admin confirmed fulfillment completion from fulfillment center.");
    setIsProcessing(null);
    setActionMessage({
      id: requestId,
      msg: res.message,
      type: res.success ? "success" : "error",
    });
    if (res.success) router.refresh();
  };

  const handleReleaseRefund = async (requestId: string) => {
    const confirmed = window.confirm(
      "Release or refund outstanding payment holds for this transaction?"
    );
    if (!confirmed) return;

    setIsProcessing(requestId);
    setActionMessage(null);
    const res = await adminReleaseRefundAction(requestId, "Admin confirmed release/refund from fulfillment center.");
    setIsProcessing(null);
    setActionMessage({
      id: requestId,
      msg: res.message,
      type: res.success ? "success" : "error",
    });
    if (res.success) router.refresh();
  };

  const handleDelete = async (requestId: string) => {
    const confirmed = window.confirm(
      "Permanently delete this fulfillment transaction from admin records? Use cancel/refund first if money is authorized or captured."
    );
    if (!confirmed) return;

    setIsProcessing(requestId);
    setActionMessage(null);
    const res = await adminDeleteFulfillmentAction(requestId);
    setIsProcessing(null);
    setActionMessage({
      id: requestId,
      msg: res.message,
      type: res.success ? "success" : "error",
    });
    if (res.success) router.refresh();
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

  const filterCards: Array<{
    id: AdminFilterTab;
    label: string;
    value: number | string;
    sub: string;
    tone?: "success" | "danger" | "warning";
  }> = [
    {
      id: "ALL",
      label: "Total Requests",
      value: metrics.totalRequests,
      sub: "All fulfillment activity",
    },
    {
      id: "STUCK_EXPIRED",
      label: "Stuck / Expired",
      value: metrics.stuckOrExpiredCount,
      sub: "Draft holds and token expirations",
      tone: metrics.stuckOrExpiredCount > 0 ? "warning" : undefined,
    },
    {
      id: "ACCEPTED",
      label: "Accepted",
      value: metrics.acceptedCount,
      sub: "Partner-approved requests",
      tone: "success",
    },
    {
      id: "DECLINED",
      label: "Declined",
      value: metrics.declinedCount,
      sub: "Partner-declined requests",
      tone: metrics.declinedCount > 0 ? "danger" : undefined,
    },
    {
      id: "PENDING_REFUNDS",
      label: "Refunds / Settlement",
      value: metrics.pendingRefundsCount,
      sub: "Payment holds needing review",
      tone: metrics.pendingRefundsCount > 0 ? "warning" : undefined,
    },
    {
      id: "FAILED_EMAILS",
      label: "Email Holds",
      value: metrics.failedEmailsCount,
      sub: "Blocked or unresolved sends",
      tone: metrics.failedEmailsCount > 0 ? "danger" : undefined,
    },
  ];

  return (
    <div className="page-shell wide">
      {/* Header */}
      <div className="page-header" style={styles.header}>
        <div>
          <div className="eyebrow" style={styles.badgeLabel}>SUPERCARS INTERNAL OPERATIONS</div>
          <h1 className="page-title compact" style={styles.title}>Fulfillment Review & Control Center</h1>
          <p className="page-copy" style={styles.subtitle}>
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

      {/* Filter Summary Grid */}
      <div style={styles.kpiGrid}>
        {filterCards.map((card) => {
          const isActive = activeTab === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveTab(card.id)}
              style={{
                ...styles.kpiCard,
                ...(card.tone === "warning" ? styles.kpiCardWarn : {}),
                ...(card.tone === "danger" ? styles.kpiCardDanger : {}),
                ...(isActive ? styles.activeKpiCard : {}),
              }}
              aria-pressed={isActive}
            >
              <div style={{ ...styles.kpiLabel, ...(isActive ? styles.activeKpiLabel : {}) }}>
                {card.label}
              </div>
              <div
                style={{
                  ...styles.kpiValue,
                  ...(card.tone === "success" ? styles.kpiValueSuccess : {}),
                  ...(card.tone === "warning" ? styles.kpiValueWarning : {}),
                  ...(card.tone === "danger" ? styles.kpiValueDanger : {}),
                  ...(isActive ? styles.activeKpiValue : {}),
                }}
              >
                {card.value}
              </div>
              <div style={{ ...styles.kpiSub, ...(isActive ? styles.activeKpiSub : {}) }}>
                {card.sub}
              </div>
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
        <select
          aria-label="Filter by request type"
          value={requestTypeFilter}
          onChange={(e) => setRequestTypeFilter(e.target.value)}
          style={styles.typeFilterSelect}
        >
          <option value="">All Request Types</option>
          {requestTypeOptions.map((requestType) => (
            <option key={requestType} value={requestType}>
              {formatRequestType(requestType)}
            </option>
          ))}
        </select>
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} style={styles.clearBtn}>
            Clear
          </button>
        )}
      </div>

      {/* Operations Table */}
      <div className="mobile-scroll admin-table-shell" style={styles.tableContainer}>
        <table className="admin-ops-table" style={styles.table}>
          <colgroup>
            <col className="admin-ops-request-col" />
            <col className="admin-ops-vehicle-col" />
            <col className="admin-ops-party-col" />
            <col className="admin-ops-status-col" />
            <col className="admin-ops-audit-col" />
            <col className="admin-ops-financial-col" />
            <col className="admin-ops-actions-col" />
          </colgroup>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.th}>REQUEST TYPE</th>
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
                    {/* 1. Request Type */}
                    <td className="admin-ops-request-cell" style={styles.td}>
                      <span className="admin-ops-type-badge" style={getTypeBadgeStyle(req.requestType)}>
                        {formatRequestType(req.requestType)}
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
                    <td className="admin-ops-status-cell" style={styles.td}>
                      <span className="admin-ops-status-badge" style={getStatusBadgeStyle(req.status)}>{req.status}</span>
                      <div style={{ marginTop: "4px" }}>
                        <span className="admin-ops-payment-badge" style={getPaymentBadgeStyle(req.paymentStatus)}>{req.paymentStatus}</span>
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
                      <div className="admin-ops-audit-note" style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
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
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "132px" }}>
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

                        <Link
                          href={`/transactions/${req.publicTransactionToken}`}
                          style={styles.actionBtnHub}
                          title="Buyer/owner scoped transaction page. Admin access is intentionally limited unless the admin account is a transaction party."
                        >
                          View
                        </Link>

                        <button
                          disabled={isBusy}
                          onClick={() => handleDelete(req.id)}
                          style={styles.actionBtnDelete}
                          title="Permanently remove this fulfillment transaction after money state is resolved."
                        >
                          Delete
                        </button>
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

function formatRequestType(type: string) {
  return type.replaceAll("_", " ");
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
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "24px",
    borderBottom: "1px solid var(--line)",
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
  },
  subtitle: {
    fontSize: "14px",
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
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#E2E8F0",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
  },
  activeKpiCard: {
    borderColor: "#0F172A",
    backgroundColor: "#0F172A",
    boxShadow: "0 14px 32px rgba(15, 23, 42, 0.18)",
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
  kpiValueSuccess: {
    color: "#10B981",
  },
  kpiValueWarning: {
    color: "#D97706",
  },
  kpiValueDanger: {
    color: "#DC2626",
  },
  kpiSub: {
    fontSize: "11px",
    color: "#64748B",
  },
  activeKpiLabel: {
    color: "#FFFFFF",
  },
  activeKpiValue: {
    color: "#FFFFFF",
  },
  activeKpiSub: {
    color: "#CBD5E1",
  },
  searchBar: {
    display: "flex",
    gap: "8px",
    marginBottom: "20px",
    flexWrap: "wrap",
  },
  searchInput: {
    flex: 1,
    minWidth: "240px",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #CBD5E1",
    fontSize: "14px",
    outline: "none",
  },
  typeFilterSelect: {
    minWidth: "190px",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #CBD5E1",
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: "13px",
    fontWeight: 700,
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
    overflowWrap: "anywhere",
    whiteSpace: "normal",
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
    padding: "6px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 700,
    textDecoration: "none",
    textAlign: "center",
  },
  actionBtnDelete: {
    backgroundColor: "#FFFFFF",
    color: "#991B1B",
    border: "1px solid #FCA5A5",
    padding: "5px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 800,
    cursor: "pointer",
  },
};
