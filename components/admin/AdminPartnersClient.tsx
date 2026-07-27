"use client";

/**
 * components/admin/AdminPartnersClient.tsx
 *
 * Sprint 7B Admin Partner Contact Resolution Portal Client Component.
 * Allows administrators to review unresolved partner contacts, inspect attached crawler listing sources,
 * input verified published emails, and trigger automatic dispatch of held DRAFT requests.
 */

import React, { useState } from "react";
import { resolvePartnerEmailAction } from "@/app/actions/admin-partner";
import { PartnerConfidence } from "@/lib/fulfillment/partner-registry";

export interface AdminPartnerContactItem {
  id: string;
  name: string;
  type: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  sourceDomain?: string | null;
  makeSpecialization?: string | null;
  location?: string | null;
  active: boolean;
  contactSource: string;
  confidence: string;
  contactStatus: string;
  lastVerifiedAt?: string | Date | null;
  marketSource?: {
    id: string;
    name: string;
    domain?: string | null;
  } | null;
  heldRequestCount: number;
}

interface AdminPartnersClientProps {
  contacts: AdminPartnerContactItem[];
}

export function AdminPartnersClient({ contacts }: AdminPartnersClientProps) {
  const [filterTab, setFilterTab] = useState<"UNRESOLVED" | "ALL">("UNRESOLVED");
  const [searchQuery, setSearchQuery] = useState("");
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  const [confidenceInputs, setConfidenceInputs] = useState<Record<string, PartnerConfidence>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ id: string; msg: string; type: "success" | "error" } | null>(null);

  const unresolvedCount = contacts.filter(
    (c) => c.contactStatus === "UNRESOLVED_EMAIL" || c.confidence === "UNRESOLVED_EMAIL" || !c.email
  ).length;

  const filteredContacts = contacts.filter((c) => {
    const isUnresolved = c.contactStatus === "UNRESOLVED_EMAIL" || c.confidence === "UNRESOLVED_EMAIL" || !c.email;
    if (filterTab === "UNRESOLVED" && !isUnresolved) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = c.name.toLowerCase().includes(q);
      const emailMatch = c.email?.toLowerCase().includes(q);
      const domainMatch = c.sourceDomain?.toLowerCase().includes(q);
      if (!nameMatch && !emailMatch && !domainMatch) return false;
    }

    return true;
  });

  const handleResolve = async (partnerId: string) => {
    const emailToSubmit = emailInputs[partnerId];
    if (!emailToSubmit || !emailToSubmit.includes("@")) {
      alert("Please enter a valid published partner email address.");
      return;
    }

    const conf = confidenceInputs[partnerId] || "MANUAL_REVIEW";

    setProcessingId(partnerId);
    setStatusMessage(null);

    const res = await resolvePartnerEmailAction(partnerId, emailToSubmit, conf, "MANUALLY_VERIFIED");

    setProcessingId(null);
    setStatusMessage({
      id: partnerId,
      msg: res.message,
      type: res.success ? "success" : "error",
    });

    if (res.success) {
      setEmailInputs((prev) => ({ ...prev, [partnerId]: "" }));
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.badgeLabel}>SUPERCARS PARTNER ROUTING REGISTRY</div>
          <h1 style={styles.title}>Partner Contact & Email Resolution Hub</h1>
          <p style={styles.subtitle}>
            Audit imported dealer listings, resolve missing business emails, and enforce zero guessed emails across all partner outreach.
          </p>
        </div>
        <div style={styles.unresolvedAlert}>
          ⚠️ {unresolvedCount} Unresolved Partner Email(s)
        </div>
      </div>

      {/* Tabs & Search */}
      <div style={styles.controlsRow}>
        <div style={styles.tabGroup}>
          <button
            onClick={() => setFilterTab("UNRESOLVED")}
            style={{
              ...styles.tabBtn,
              ...(filterTab === "UNRESOLVED" ? styles.activeTabBtn : {}),
            }}
          >
            ⚠️ Pending Resolution ({unresolvedCount})
          </button>
          <button
            onClick={() => setFilterTab("ALL")}
            style={{
              ...styles.tabBtn,
              ...(filterTab === "ALL" ? styles.activeTabBtn : {}),
            }}
          >
            All Registered Partners ({contacts.length})
          </button>
        </div>

        <input
          type="text"
          placeholder="Filter by partner name, domain, or location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* Table Container */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.th}>PARTNER NAME & TYPE</th>
              <th style={styles.th}>SOURCE & DOMAIN</th>
              <th style={styles.th}>CONFIDENCE LEVEL</th>
              <th style={styles.th}>HELD DRAFT REQUESTS</th>
              <th style={styles.th}>EMAIL RESOLUTION ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#64748B" }}>
                  {filterTab === "UNRESOLVED"
                    ? "🎉 All partner emails are fully resolved! Zero guessed emails."
                    : "No partner contacts match your filter."}
                </td>
              </tr>
            ) : (
              filteredContacts.map((c) => {
                const isUnresolved = c.contactStatus === "UNRESOLVED_EMAIL" || c.confidence === "UNRESOLVED_EMAIL" || !c.email;
                const isBusy = processingId === c.id;
                const msg = statusMessage?.id === c.id ? statusMessage : null;

                return (
                  <tr key={c.id} style={{ ...styles.tableRow, ...(isUnresolved ? styles.unresolvedRow : {}) }}>
                    {/* 1. Partner Name & Type */}
                    <td style={styles.td}>
                      <div style={{ fontWeight: 800, fontSize: "14px", color: "#0F172A" }}>{c.name}</div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                        <span style={getTypeBadgeStyle(c.type)}>{c.type}</span>
                        {c.makeSpecialization && (
                          <span style={styles.specBadge}>{c.makeSpecialization}</span>
                        )}
                      </div>
                      {c.location && <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}>📍 {c.location}</div>}
                    </td>

                    {/* 2. Source & Domain */}
                    <td style={styles.td}>
                      <span style={getSourceBadgeStyle(c.contactSource)}>
                        {c.contactSource.replace("_", " ")}
                      </span>
                      {c.website && (
                        <div style={{ marginTop: "4px" }}>
                          <a href={c.website} target="_blank" rel="noopener noreferrer" style={styles.linkText}>
                            🌐 {c.sourceDomain || c.website}
                          </a>
                        </div>
                      )}
                      {c.marketSource && (
                        <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
                          Listing Source: {c.marketSource.name}
                        </div>
                      )}
                    </td>

                    {/* 3. Confidence Level */}
                    <td style={styles.td}>
                      <span style={getConfidenceBadgeStyle(c.confidence)}>
                        {c.confidence}
                      </span>
                      {c.email ? (
                        <div style={{ fontSize: "12px", color: "#10B981", fontWeight: 600, marginTop: "4px" }}>
                          {c.email}
                        </div>
                      ) : (
                        <div style={{ fontSize: "11px", color: "#EF4444", fontWeight: 800, marginTop: "4px" }}>
                          ⚠️ NO VALID EMAIL
                        </div>
                      )}
                    </td>

                    {/* 4. Held Draft Requests */}
                    <td style={styles.td}>
                      {c.heldRequestCount > 0 ? (
                        <span style={styles.heldCountBadge}>
                          🛑 {c.heldRequestCount} Request(s) Held in DRAFT
                        </span>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#94A3B8" }}>0 Held Requests</span>
                      )}
                    </td>

                    {/* 5. Email Resolution Form */}
                    <td style={styles.td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "260px" }}>
                        <input
                          type="email"
                          placeholder="Enter verified business email..."
                          value={emailInputs[c.id] || ""}
                          onChange={(e) => setEmailInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          style={styles.emailInput}
                        />

                        <div style={{ display: "flex", gap: "6px" }}>
                          <select
                            value={confidenceInputs[c.id] || "MANUAL_REVIEW"}
                            onChange={(e) =>
                              setConfidenceInputs((prev) => ({
                                ...prev,
                                [c.id]: e.target.value as PartnerConfidence,
                              }))
                            }
                            style={styles.selectInput}
                          >
                            <option value="VERIFIED">VERIFIED</option>
                            <option value="PUBLIC_SOURCE">PUBLIC_SOURCE</option>
                            <option value="MANUAL_REVIEW">MANUAL_REVIEW</option>
                          </select>

                          <button
                            disabled={isBusy}
                            onClick={() => handleResolve(c.id)}
                            style={styles.resolveBtn}
                          >
                            {isBusy ? "Saving..." : "Resolve & Dispatch"}
                          </button>
                        </div>

                        {msg && (
                          <div
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: msg.type === "success" ? "#10B981" : "#EF4444",
                            }}
                          >
                            {msg.msg}
                          </div>
                        )}
                      </div>
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

// Styling helpers
function getTypeBadgeStyle(type: string): React.CSSProperties {
  switch (type) {
    case "DEALER":
      return { backgroundColor: "#DBEAFE", color: "#1E40AF", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    case "INSURER":
      return { backgroundColor: "#D1FAE5", color: "#065F46", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    case "TRANSPORTER":
      return { backgroundColor: "#FEF3C7", color: "#92400E", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    case "SERVICE_SHOP":
      return { backgroundColor: "#F3E8FF", color: "#6B21A8", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    default:
      return { backgroundColor: "#F1F5F9", color: "#475569", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
  }
}

function getSourceBadgeStyle(source: string): React.CSSProperties {
  switch (source) {
    case "IMPORTED_LISTING":
      return { backgroundColor: "#EDE9FE", color: "#5B21B6", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    case "MANUALLY_VERIFIED":
      return { backgroundColor: "#D1FAE5", color: "#065F46", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
    default:
      return { backgroundColor: "#F1F5F9", color: "#475569", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 };
  }
}

function getConfidenceBadgeStyle(confidence: string): React.CSSProperties {
  switch (confidence) {
    case "VERIFIED":
      return { backgroundColor: "#10B981", color: "#FFFFFF", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 800 };
    case "PUBLIC_SOURCE":
      return { backgroundColor: "#3B82F6", color: "#FFFFFF", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 800 };
    case "MANUAL_REVIEW":
      return { backgroundColor: "#F59E0B", color: "#FFFFFF", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 800 };
    case "UNRESOLVED_EMAIL":
    default:
      return { backgroundColor: "#EF4444", color: "#FFFFFF", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 800 };
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
  badgeLabel: {
    fontSize: "11px",
    fontWeight: 800,
    color: "#2563EB",
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
  unresolvedAlert: {
    backgroundColor: "#FEF2F2",
    color: "#DC2626",
    border: "1px solid #FECACA",
    padding: "10px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 800,
  },
  controlsRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "20px",
  },
  tabGroup: {
    display: "flex",
    gap: "8px",
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
  },
  activeTabBtn: {
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    borderColor: "#0F172A",
  },
  searchInput: {
    width: "300px",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #CBD5E1",
    fontSize: "13px",
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
  unresolvedRow: {
    backgroundColor: "#FFFBFA",
  },
  td: {
    padding: "12px 14px",
    verticalAlign: "top",
  },
  specBadge: {
    backgroundColor: "#F1F5F9",
    color: "#334155",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "10px",
    fontWeight: 700,
  },
  linkText: {
    fontSize: "11px",
    color: "#2563EB",
    textDecoration: "none",
  },
  heldCountBadge: {
    backgroundColor: "#FEF2F2",
    color: "#DC2626",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 800,
    display: "inline-block",
  },
  emailInput: {
    padding: "6px 10px",
    borderRadius: "4px",
    border: "1px solid #CBD5E1",
    fontSize: "12px",
    width: "100%",
  },
  selectInput: {
    padding: "6px",
    borderRadius: "4px",
    border: "1px solid #CBD5E1",
    fontSize: "11px",
    fontWeight: 600,
    backgroundColor: "#FFFFFF",
  },
  resolveBtn: {
    backgroundColor: "#10B981",
    color: "#FFFFFF",
    border: "none",
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
