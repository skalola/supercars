"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

export type FilterCategory =
  | "ALL"
  | "BUYING"
  | "SELLING"
  | "SERVICE_BOOKINGS"
  | "INSURANCE_REQUESTS"
  | "TRANSPORT_REQUESTS";

export interface TransactionCenterItem {
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
    roleDescription?: string | null;
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
  events?: Array<{
    id: string;
    createdAt: string | Date;
    newStatus: string;
    note?: string | null;
  }>;
  isOwnerView?: boolean;
}

interface TransactionCenterClientProps {
  userId?: string;
  transactions: TransactionCenterItem[];
}

const tabs: Array<{ id: FilterCategory; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "BUYING", label: "Buying" },
  { id: "SELLING", label: "Selling" },
  { id: "SERVICE_BOOKINGS", label: "Service" },
  { id: "INSURANCE_REQUESTS", label: "Insurance" },
  { id: "TRANSPORT_REQUESTS", label: "Transport" },
];

export function TransactionCenterClient({ userId, transactions }: TransactionCenterClientProps) {
  const [activeTab, setActiveTab] = useState<FilterCategory>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const summary = useMemo(() => {
    const active = transactions.filter((tx) => ["SENT", "VIEWED", "ACCEPTED", "READY_TO_SEND"].includes(tx.status)).length;
    const attention = transactions.filter((tx) => ["DECLINED", "EXPIRED", "FAILED"].includes(tx.status) || tx.paymentStatus === "FAILED").length;
    const captured = transactions.reduce((sum, tx) => sum + (tx.collectedAmount || 0), 0);
    return { total: transactions.length, active, attention, captured };
  }, [transactions]);

  const filteredTransactions = transactions.filter((tx) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const vinMatch = tx.vehicle?.vin.toLowerCase().includes(q);
      const makeMatch = tx.vehicle?.make.toLowerCase().includes(q);
      const modelMatch = tx.vehicle?.model.toLowerCase().includes(q);
      const partnerMatch = tx.parties?.some((p) => p.name.toLowerCase().includes(q));
      if (!vinMatch && !makeMatch && !modelMatch && !partnerMatch) return false;
    }

    switch (activeTab) {
      case "BUYING":
        return tx.requestType === "DEALER_PURCHASE" && !tx.isOwnerView;
      case "SELLING":
        return tx.requestType === "DEALER_PURCHASE" && tx.isOwnerView;
      case "SERVICE_BOOKINGS":
        return tx.requestType === "SERVICE_BOOKING";
      case "INSURANCE_REQUESTS":
        return tx.requestType === "INSURANCE_QUOTE";
      case "TRANSPORT_REQUESTS":
        return tx.requestType === "TRANSPORT_QUOTE";
      default:
        return true;
    }
  });

  function getTabCount(cat: FilterCategory) {
    return transactions.filter((tx) => {
      switch (cat) {
        case "BUYING":
          return tx.requestType === "DEALER_PURCHASE" && !tx.isOwnerView;
        case "SELLING":
          return tx.requestType === "DEALER_PURCHASE" && tx.isOwnerView;
        case "SERVICE_BOOKINGS":
          return tx.requestType === "SERVICE_BOOKING";
        case "INSURANCE_REQUESTS":
          return tx.requestType === "INSURANCE_QUOTE";
        case "TRANSPORT_REQUESTS":
          return tx.requestType === "TRANSPORT_QUOTE";
        default:
          return true;
      }
    }).length;
  }

  return (
    <main className="page-shell">
      <section className="page-header" style={styles.header}>
        <div>
          <div className="eyebrow">Transactions</div>
          <h1 className="page-title compact" style={styles.title}>Your SUPERCARS Requests</h1>
          <p className="page-copy" style={styles.subtitle}>Purchases, service bookings, insurance quotes, and transport requests in one place.</p>
        </div>
        {!userId && (
          <Link href="/login" className="site-button" style={styles.primaryAction}>
            Sign in
          </Link>
        )}
      </section>

      <section style={styles.summaryGrid} aria-label="Transaction summary">
        <SummaryStat label="Total" value={summary.total.toLocaleString()} />
        <SummaryStat label="Active" value={summary.active.toLocaleString()} tone="blue" />
        <SummaryStat label="Needs Review" value={summary.attention.toLocaleString()} tone="red" />
        <SummaryStat label="Captured" value={`$${summary.captured.toLocaleString()}`} tone="green" />
      </section>

      <section className="transaction-toolbar" style={styles.toolbar}>
        <div style={styles.tabContainer}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{ ...styles.tabBtn, ...(active ? styles.activeTabBtn : {}) }}
              >
                <span>{tab.label}</span>
                <span style={{ ...styles.tabBadge, ...(active ? styles.activeTabBadge : {}) }}>{getTabCount(tab.id)}</span>
              </button>
            );
          })}
        </div>
        <div style={styles.searchWrap}>
          <input
            type="search"
            placeholder="Search VIN, vehicle, or partner"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            style={styles.searchInput}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} style={styles.clearBtn}>
              Clear
            </button>
          )}
        </div>
      </section>

      {filteredTransactions.length === 0 ? (
        <section style={styles.emptyState}>
          <h2 style={styles.emptyTitle}>No matching transactions</h2>
          <p style={styles.emptyText}>{searchQuery ? `No results for "${searchQuery}".` : "New requests will appear here as soon as they are created."}</p>
          <Link href="/inventory" style={styles.secondaryAction}>
            Browse inventory
          </Link>
        </section>
      ) : (
        <section style={styles.list}>
          {filteredTransactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </section>
      )}
    </main>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: "blue" | "green" | "red" }) {
  return (
    <div style={styles.summaryItem}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={{ ...styles.summaryValue, color: toneColor(tone) }}>{value}</div>
    </div>
  );
}

function TransactionRow({ tx }: { tx: TransactionCenterItem }) {
  const partner =
    tx.parties?.find((p) => !["BUYER", "SELLER", "PLATFORM"].includes(p.partyType)) ||
    tx.parties?.find((p) => p.partyType === "SELLER");
  const deposit = tx.depositIntents?.[0];
  const latest = tx.events?.[0];
  const detailHref = `/transactions/${tx.publicTransactionToken || tx.id}`;
  const title = tx.vehicle ? `${tx.vehicle.year} ${tx.vehicle.make} ${tx.vehicle.model}` : typeLabel(tx.requestType);
  const status = statusPresentation(tx.status);

  return (
    <article className="transaction-row" style={styles.row}>
      <div style={styles.vehicleBlock}>
        {tx.vehicle?.image ? (
          <Image src={tx.vehicle.image} alt={title} width={72} height={54} unoptimized style={styles.thumbnail} />
        ) : (
          <div style={styles.thumbnailPlaceholder}>{tx.vehicle?.make?.slice(0, 1) || "S"}</div>
        )}
        <div style={styles.vehicleText}>
          <div style={styles.vehicleTitle}>{title}</div>
          {tx.vehicle?.trim && <div style={styles.vehicleMeta}>{tx.vehicle.trim}</div>}
          {tx.vehicle?.vin && (
            <Link href={`/vehicle/${tx.vehicle.vin}`} style={styles.vinLink}>
              {tx.vehicle.vin}
            </Link>
          )}
        </div>
      </div>

      <div className="transaction-middle-grid" style={styles.middleGrid}>
        <InfoCell label="Request" value={typeLabel(tx.requestType)} subValue={tx.isOwnerView ? "Owner view" : "Buyer view"} />
        <InfoCell label="Partner" value={partner?.name || "Pending"} subValue={partner ? partnerLabel(partner.partyType) : "Awaiting assignment"} />
        <div>
          <div style={styles.cellLabel}>Status</div>
          <span style={{ ...styles.statusBadge, backgroundColor: status.background, color: status.color }}>{status.label}</span>
          <div style={styles.cellSub}>{status.caption}</div>
        </div>
        <InfoCell
          label="Updated"
          value={formatDate(latest?.createdAt || tx.updatedAt)}
          subValue={latest ? statusPresentation(latest.newStatus).label : "Created"}
        />
        <InfoCell
          label={deposit ? "Hold" : "Payment"}
          value={deposit ? `$${deposit.amount.toLocaleString()}` : paymentValue(tx)}
          subValue={deposit ? paymentLabel(deposit.status) : paymentLabel(tx.paymentStatus)}
        />
      </div>

      <Link href={detailHref} className="transaction-row-action" style={styles.rowAction}>
        View
      </Link>
    </article>
  );
}

function InfoCell({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div>
      <div style={styles.cellLabel}>{label}</div>
      <div style={styles.cellValue}>{value}</div>
      {subValue && <div style={styles.cellSub}>{subValue}</div>}
    </div>
  );
}

function typeLabel(type: string): string {
  switch (type) {
    case "DEALER_PURCHASE":
      return "Dealer purchase";
    case "INSURANCE_QUOTE":
      return "Insurance quote";
    case "TRANSPORT_QUOTE":
      return "Transport quote";
    case "SERVICE_BOOKING":
      return "Service booking";
    default:
      return type.replaceAll("_", " ").toLowerCase();
  }
}

function partnerLabel(type: string): string {
  return type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusPresentation(status: string) {
  switch (status) {
    case "DRAFT":
      return { label: "Needs partner email", caption: "Request is held", background: "#FEF3C7", color: "#92400E" };
    case "READY_TO_SEND":
    case "SENT":
      return { label: "Sent", caption: "Awaiting partner", background: "#DBEAFE", color: "#1D4ED8" };
    case "VIEWED":
      return { label: "Viewed", caption: "Partner is reviewing", background: "#E0F2FE", color: "#0369A1" };
    case "ACCEPTED":
      return { label: "Accepted", caption: "Partner confirmed", background: "#D1FAE5", color: "#047857" };
    case "DECLINED":
      return { label: "Declined", caption: "Hold released", background: "#FEE2E2", color: "#B91C1C" };
    case "EXPIRED":
      return { label: "Expired", caption: "No partner response", background: "#F3F4F6", color: "#4B5563" };
    case "CANCELLED":
      return { label: "Cancelled", caption: "Settlement applied", background: "#FEE2E2", color: "#B91C1C" };
    case "COMPLETED":
      return { label: "Completed", caption: "Closed", background: "#DCFCE7", color: "#166534" };
    default:
      return { label: status, caption: "In progress", background: "#F1F5F9", color: "#475569" };
  }
}

function paymentLabel(status: string): string {
  switch (status) {
    case "AUTHORIZED":
    case "HELD":
      return "Authorized";
    case "CAPTURED":
      return "Captured";
    case "RELEASED":
    case "VOIDED":
      return "Released";
    case "REFUNDED":
      return "Refunded";
    case "NOT_REQUIRED":
      return "Not required";
    case "FAILED":
      return "Failed";
    default:
      return status.replaceAll("_", " ").toLowerCase();
  }
}

function paymentValue(tx: TransactionCenterItem): string {
  const value = tx.collectedAmount || tx.expectedPlatformFee || tx.expectedPartnerCommission || 0;
  return value > 0 ? `$${value.toLocaleString()}` : "$0";
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toneColor(tone?: "blue" | "green" | "red"): string {
  if (tone === "blue") return "#2563EB";
  if (tone === "green") return "#059669";
  if (tone === "red") return "#DC2626";
  return "#0F172A";
}

const styles: Record<string, React.CSSProperties> = {
  container: {
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    alignItems: "flex-start",
    marginBottom: "22px",
  },
  eyebrow: {
    fontSize: "12px",
    fontWeight: 800,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  title: {
    lineHeight: 1.1,
  },
  subtitle: {
    fontSize: "14px",
  },
  primaryAction: {
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    borderRadius: "6px",
    padding: "10px 16px",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 750,
  },
  secondaryAction: {
    display: "inline-block",
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    borderRadius: "6px",
    padding: "10px 16px",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 750,
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "10px",
    marginBottom: "18px",
  },
  summaryItem: {
    border: "1px solid #E2E8F0",
    borderRadius: "8px",
    padding: "14px",
    backgroundColor: "#FFFFFF",
  },
  summaryLabel: {
    color: "#64748B",
    fontSize: "12px",
    fontWeight: 750,
  },
  summaryValue: {
    fontSize: "22px",
    fontWeight: 850,
    marginTop: "3px",
  },
  toolbar: {
    display: "grid",
    gridTemplateColumns: "1fr minmax(260px, 360px)",
    gap: "14px",
    alignItems: "center",
    marginBottom: "16px",
  },
  tabContainer: {
    display: "flex",
    gap: "6px",
    overflowX: "auto",
    paddingBottom: "4px",
  },
  tabBtn: {
    height: "38px",
    padding: "0 12px",
    borderRadius: "6px",
    border: "1px solid #CBD5E1",
    backgroundColor: "#FFFFFF",
    color: "#334155",
    fontWeight: 750,
    fontSize: "13px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "7px",
    whiteSpace: "nowrap",
  },
  activeTabBtn: {
    backgroundColor: "#111827",
    borderColor: "#111827",
    color: "#FFFFFF",
  },
  tabBadge: {
    minWidth: "20px",
    height: "20px",
    borderRadius: "999px",
    backgroundColor: "#F1F5F9",
    color: "#475569",
    fontSize: "11px",
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
  },
  activeTabBadge: {
    backgroundColor: "#334155",
    color: "#FFFFFF",
  },
  searchWrap: {
    display: "flex",
    gap: "8px",
  },
  searchInput: {
    width: "100%",
    height: "40px",
    borderRadius: "6px",
    border: "1px solid #CBD5E1",
    padding: "0 12px",
    fontSize: "14px",
  },
  clearBtn: {
    borderRadius: "6px",
    border: "1px solid #CBD5E1",
    padding: "0 12px",
    backgroundColor: "#F8FAFC",
    fontWeight: 750,
    cursor: "pointer",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1.25fr) minmax(520px, 2.5fr) 72px",
    gap: "18px",
    alignItems: "center",
    border: "1px solid #E2E8F0",
    borderRadius: "8px",
    backgroundColor: "#FFFFFF",
    padding: "14px",
  },
  vehicleBlock: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    minWidth: 0,
  },
  thumbnail: {
    width: "72px",
    height: "54px",
    borderRadius: "6px",
    objectFit: "cover",
    backgroundColor: "#F1F5F9",
  },
  thumbnailPlaceholder: {
    width: "72px",
    height: "54px",
    borderRadius: "6px",
    backgroundColor: "#F1F5F9",
    color: "#475569",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
    fontWeight: 850,
  },
  vehicleText: {
    minWidth: 0,
  },
  vehicleTitle: {
    color: "#0F172A",
    fontSize: "14px",
    fontWeight: 850,
    lineHeight: 1.25,
  },
  vehicleMeta: {
    color: "#64748B",
    fontSize: "12px",
    marginTop: "2px",
  },
  vinLink: {
    display: "inline-block",
    marginTop: "4px",
    color: "#2563EB",
    fontSize: "12px",
    textDecoration: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  middleGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1.25fr 1fr 1fr 0.9fr",
    gap: "12px",
  },
  cellLabel: {
    color: "#64748B",
    fontSize: "11px",
    fontWeight: 800,
    textTransform: "uppercase",
    marginBottom: "3px",
  },
  cellValue: {
    color: "#111827",
    fontSize: "13px",
    fontWeight: 800,
    lineHeight: 1.25,
  },
  cellSub: {
    color: "#64748B",
    fontSize: "12px",
    marginTop: "3px",
    lineHeight: 1.25,
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "24px",
    padding: "0 9px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 850,
  },
  rowAction: {
    height: "36px",
    borderRadius: "6px",
    backgroundColor: "#111827",
    color: "#FFFFFF",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: "13px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    border: "1px solid #E2E8F0",
    borderRadius: "8px",
    backgroundColor: "#FFFFFF",
    padding: "44px 24px",
    textAlign: "center",
  },
  emptyTitle: {
    color: "#0F172A",
    fontSize: "20px",
    fontWeight: 850,
    margin: "0 0 6px",
  },
  emptyText: {
    color: "#64748B",
    margin: "0 0 18px",
  },
};
