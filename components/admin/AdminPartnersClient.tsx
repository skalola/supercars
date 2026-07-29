"use client";

/**
 * components/admin/AdminPartnersClient.tsx
 *
 * Sprint 7B Admin Partner Contact Resolution Portal Client Component.
 * Allows administrators to review unresolved partner contacts, inspect attached crawler listing sources,
 * input verified published emails, and trigger automatic dispatch of held DRAFT requests.
 */

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { addVendorAction, removeVendorAction, resolvePartnerEmailAction } from "@/app/actions/admin-partner";
import type { PartnerConfidence, PartnerType } from "@/lib/fulfillment/partner-registry";

type VendorFormState = {
  name: string;
  type: PartnerType;
  location: string;
  email: string;
  phone: string;
  website: string;
  makeSpecialization: string;
};

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
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [geocodedLocation, setGeocodedLocation] = useState<ResolvedLocation | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [makeFilter, setMakeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  const [confidenceInputs, setConfidenceInputs] = useState<Record<string, PartnerConfidence>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [vendorForm, setVendorForm] = useState<VendorFormState>({
    name: "",
    type: "DEALER",
    location: "",
    email: "",
    phone: "",
    website: "",
    makeSpecialization: "ALL",
  });
  const [statusMessage, setStatusMessage] = useState<{ id: string; msg: string; type: "success" | "error" } | null>(null);

  const unresolvedCount = contacts.filter(
    (c) => c.contactStatus === "UNRESOLVED_EMAIL" || c.confidence === "UNRESOLVED_EMAIL" || !c.email
  ).length;
  const localLocation = useMemo(() => resolveLocalPartnerLocation(locationFilter), [locationFilter]);
  const typedLocation = localLocation || geocodedLocation;
  const normalizedLocationFilter = normalizeSearch(locationFilter);

  useEffect(() => {
    const query = locationFilter.trim();
    setGeocodedLocation(null);
    setLocationMessage("");

    if (!query || localLocation) {
      setIsGeocoding(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsGeocoding(true);
      try {
        const response = await fetch(`/api/location/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await response.json() as {
          result?: {
            label: string;
            latitude: number;
            longitude: number;
          } | null;
        };

        if (data.result) {
          setGeocodedLocation({
            label: data.result.label,
            coordinates: {
              latitude: data.result.latitude,
              longitude: data.result.longitude,
            },
          });
        } else if (isLikelyLocationQuery(query)) {
          setLocationMessage("No matching location found. Try a nearby city, state, or zip code.");
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLocationMessage("Location lookup is unavailable. Try a city, state, or zip code.");
        }
      } finally {
        setIsGeocoding(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [locationFilter, localLocation]);

  const typeOptions = [
    { value: "DEALER", label: "Dealer" },
    { value: "SERVICE_SHOP", label: "Service" },
    { value: "TRANSPORTER", label: "Courier" },
    { value: "INSURER", label: "Insurance" },
  ];

  const makeOptions = Array.from(
    new Set(contacts.map((c) => c.makeSpecialization || "ALL").filter(Boolean))
  ).sort();

  const resetFilters = () => {
    setSearchQuery("");
    setTypeFilter("");
    setLocationFilter("");
    setGeocodedLocation(null);
    setLocationMessage("");
    setMakeFilter("");
    setStatusFilter("");
  };

  const filteredContacts = contacts
    .map((c) => ({
      ...c,
      distanceMiles:
        typedLocation && c.latitude !== null && c.latitude !== undefined && c.longitude !== null && c.longitude !== undefined
          ? calculateDistanceMiles(
              typedLocation.coordinates.latitude,
              typedLocation.coordinates.longitude,
              c.latitude,
              c.longitude
            )
          : null,
    }))
    .filter((c) => {
      const isUnresolved = c.contactStatus === "UNRESOLVED_EMAIL" || c.confidence === "UNRESOLVED_EMAIL" || !c.email;
      if (filterTab === "UNRESOLVED" && !locationFilter.trim() && !isUnresolved) return false;

      if (typeFilter && c.type !== typeFilter) return false;
      if (makeFilter && (c.makeSpecialization || "ALL") !== makeFilter) return false;
      if (statusFilter === "ACTIVE" && !c.active) return false;
      if (statusFilter === "INACTIVE" && c.active) return false;

      if (typedLocation) {
        return c.distanceMiles !== null && c.distanceMiles <= 100;
      }

      if (normalizedLocationFilter && !isLikelyLocationQuery(locationFilter)) {
        const locationMatch = [c.location, c.city, c.state, c.postalCode, c.name]
          .filter(Boolean)
          .some((value) => normalizeSearch(String(value)).includes(normalizedLocationFilter));
        if (!locationMatch) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = c.name.toLowerCase().includes(q);
        const emailMatch = c.email?.toLowerCase().includes(q);
        const domainMatch = c.sourceDomain?.toLowerCase().includes(q);
        const phoneMatch = c.phone?.toLowerCase().includes(q);
        const websiteMatch = c.website?.toLowerCase().includes(q);
        const locationMatch = c.location?.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !domainMatch && !phoneMatch && !websiteMatch && !locationMatch) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (a.distanceMiles !== null && b.distanceMiles !== null) return a.distanceMiles - b.distanceMiles;
      if (a.distanceMiles !== null) return -1;
      if (b.distanceMiles !== null) return 1;
      return a.name.localeCompare(b.name);
    });

  const handleResolve = async (partnerId: string) => {
    const emailToSubmit = emailInputs[partnerId];
    if (!emailToSubmit || !emailToSubmit.includes("@")) {
      alert("Please enter a valid published partner email address.");
      return;
    }

    const conf = confidenceInputs[partnerId] || "MANUAL_REVIEW";

    setProcessingId(`resolve:${partnerId}`);
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

  const updateVendorForm = (field: keyof VendorFormState, value: string) => {
    setVendorForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddVendor = () => {
    if (!vendorForm.name.trim()) {
      alert("Vendor name is required.");
      return;
    }

    if (!vendorForm.email.trim() && !vendorForm.phone.trim() && !vendorForm.website.trim()) {
      alert("Add at least one contact method: email, phone, or website.");
      return;
    }

    setProcessingId("add-vendor");
    setStatusMessage(null);

    startTransition(async () => {
      const res = await addVendorAction(vendorForm);
      setStatusMessage({
        id: "global",
        msg: res.message,
        type: res.success ? "success" : "error",
      });
      setProcessingId(null);

      if (res.success) {
        setVendorForm({
          name: "",
          type: "DEALER",
          location: "",
          email: "",
          phone: "",
          website: "",
          makeSpecialization: "ALL",
        });
        setIsAddOpen(false);
      }
    });
  };

  const handleRemoveVendor = (contact: AdminPartnerContactItem) => {
    const confirmed = window.confirm(
      `Remove ${contact.name}? Vendors with transaction history will be deactivated instead of deleted.`
    );

    if (!confirmed) return;

    setProcessingId(`remove:${contact.id}`);
    setStatusMessage(null);

    startTransition(async () => {
      const res = await removeVendorAction(contact.id);
      setStatusMessage({
        id: "global",
        msg: res.message,
        type: res.success ? "success" : "error",
      });
      setProcessingId(null);
    });
  };

  return (
    <div className="page-shell wide">
      {/* Header */}
      <div className="page-header" style={styles.header}>
        <div>
          <div className="eyebrow" style={styles.badgeLabel}>SUPERCARS PARTNER ROUTING REGISTRY</div>
          <h1 className="page-title compact" style={styles.title}>Partner Contact & Email Resolution Hub</h1>
          <p className="page-copy" style={styles.subtitle}>
            Audit imported dealer listings, resolve missing business emails, and enforce zero guessed emails across all partner outreach.
          </p>
        </div>
        <div style={styles.unresolvedAlert}>
          {unresolvedCount} unresolved partner email{unresolvedCount === 1 ? "" : "s"}
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
            Pending Resolution ({unresolvedCount})
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

        <button type="button" onClick={() => setIsAddOpen(true)} style={styles.addVendorBtn}>
          Add Vendor
        </button>
      </div>

      <div className="admin-filter-toolbar" aria-label="Partner filters" style={styles.partnerFilterToolbar}>
        <label>
          <span>Search</span>
          <input
            type="search"
            placeholder="Name, email, phone, website"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>

        <label>
          <span>Service Type</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {typeOptions.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Location</span>
          <input
            type="search"
            placeholder="Zip, city, or state"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          />
        </label>

        <label>
          <span>Make</span>
          <select value={makeFilter} onChange={(e) => setMakeFilter(e.target.value)}>
            <option value="">All Makes</option>
            {makeOptions.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Any Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>

        <button type="button" onClick={resetFilters}>
          Reset
        </button>
      </div>

      {typedLocation ? (
        <div className="directory-location-message">
          Showing registered partners within 100 miles of {typedLocation.label}.
        </div>
      ) : null}
      {isGeocoding ? <div className="directory-location-message">Looking up location...</div> : null}
      {locationMessage ? <div className="directory-location-message">{locationMessage}</div> : null}

      {statusMessage?.id === "global" && (
        <div
          style={{
            ...styles.globalStatus,
            ...(statusMessage.type === "success" ? styles.globalStatusSuccess : styles.globalStatusError),
          }}
        >
          {statusMessage.msg}
        </div>
      )}

      {isAddOpen && (
        <div style={styles.modalBackdrop} role="presentation">
          <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="add-vendor-title">
            <div style={styles.modalHeader}>
              <div>
                <div className="eyebrow">Manual Vendor</div>
                <h2 id="add-vendor-title" style={styles.modalTitle}>Add Vendor</h2>
              </div>
              <button type="button" onClick={() => setIsAddOpen(false)} style={styles.closeBtn}>
                Close
              </button>
            </div>

            <div style={styles.modalGrid}>
              <label style={styles.modalLabel}>
                <span>Name</span>
                <input
                  value={vendorForm.name}
                  onChange={(e) => updateVendorForm("name", e.target.value)}
                  placeholder="Ferrari Miami"
                  style={styles.modalInput}
                />
              </label>

              <label style={styles.modalLabel}>
                <span>Service Type</span>
                <select
                  value={vendorForm.type}
                  onChange={(e) => updateVendorForm("type", e.target.value as PartnerType)}
                  style={styles.modalInput}
                >
                  <option value="DEALER">Dealer</option>
                  <option value="SERVICE_SHOP">Service</option>
                  <option value="TRANSPORTER">Transport</option>
                  <option value="INSURER">Insurance</option>
                </select>
              </label>

              <label style={styles.modalLabel}>
                <span>Location</span>
                <input
                  value={vendorForm.location}
                  onChange={(e) => updateVendorForm("location", e.target.value)}
                  placeholder="Miami, FL"
                  style={styles.modalInput}
                />
              </label>

              <label style={styles.modalLabel}>
                <span>Make</span>
                <select
                  value={vendorForm.makeSpecialization}
                  onChange={(e) => updateVendorForm("makeSpecialization", e.target.value)}
                  style={styles.modalInput}
                >
                  <option value="ALL">All</option>
                  <option value="Ferrari">Ferrari</option>
                  <option value="Lamborghini">Lamborghini</option>
                </select>
              </label>

              <label style={styles.modalLabel}>
                <span>Email</span>
                <input
                  type="email"
                  value={vendorForm.email}
                  onChange={(e) => updateVendorForm("email", e.target.value)}
                  placeholder="sales@example.com"
                  style={styles.modalInput}
                />
              </label>

              <label style={styles.modalLabel}>
                <span>Phone</span>
                <input
                  value={vendorForm.phone}
                  onChange={(e) => updateVendorForm("phone", e.target.value)}
                  placeholder="(305) 555-0100"
                  style={styles.modalInput}
                />
              </label>

              <label style={{ ...styles.modalLabel, gridColumn: "1 / -1" }}>
                <span>Website</span>
                <input
                  value={vendorForm.website}
                  onChange={(e) => updateVendorForm("website", e.target.value)}
                  placeholder="https://example.com"
                  style={styles.modalInput}
                />
              </label>
            </div>

            <div style={styles.modalActions}>
              <button type="button" onClick={() => setIsAddOpen(false)} style={styles.cancelBtn}>
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending && processingId === "add-vendor"}
                onClick={handleAddVendor}
                style={styles.saveBtn}
              >
                {isPending && processingId === "add-vendor" ? "Saving..." : "Save Vendor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="mobile-scroll admin-table-shell" style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeaderRow}>
              <th style={styles.th}>PARTNER NAME & TYPE</th>
              <th style={styles.th}>SOURCE & DOMAIN</th>
              <th style={styles.th}>CONFIDENCE LEVEL</th>
              <th style={styles.th}>HELD DRAFT REQUESTS</th>
              <th style={styles.th}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#64748B" }}>
                  {filterTab === "UNRESOLVED"
                    ? "All partner emails are fully resolved. Zero guessed emails."
                    : "No partner contacts match the selected filters."}
                </td>
              </tr>
            ) : (
              filteredContacts.map((c) => {
                const isUnresolved = c.contactStatus === "UNRESOLVED_EMAIL" || c.confidence === "UNRESOLVED_EMAIL" || !c.email;
                const isBusy = processingId === `resolve:${c.id}`;
                const isRemoving = processingId === `remove:${c.id}`;
                const msg = statusMessage?.id === c.id ? statusMessage : null;

                return (
                  <tr key={c.id} style={{ ...styles.tableRow, ...(!c.active ? styles.inactiveRow : {}), ...(isUnresolved ? styles.unresolvedRow : {}) }}>
                    {/* 1. Partner Name & Type */}
                    <td style={styles.td}>
                      <div style={{ fontWeight: 800, fontSize: "14px", color: "#0F172A" }}>{c.name}</div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                        <span style={getTypeBadgeStyle(c.type)}>{c.type}</span>
                        {c.makeSpecialization && (
                          <span style={styles.specBadge}>{c.makeSpecialization}</span>
                        )}
                      </div>
                      {c.location && (
                        <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}>
                          {c.location}
                          {c.distanceMiles !== null ? ` · ${Math.round(c.distanceMiles).toLocaleString()} miles away` : ""}
                        </div>
                      )}
                    </td>

                    {/* 2. Source & Domain */}
                    <td style={styles.td}>
                      <span style={getSourceBadgeStyle(c.contactSource)}>
                        {c.contactSource.replace("_", " ")}
                      </span>
                      {c.website && (
                        <div style={{ marginTop: "4px" }}>
                          <a href={c.website} target="_blank" rel="noopener noreferrer" style={styles.linkText}>
                            {c.sourceDomain || c.website}
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
                          NO VALID EMAIL
                        </div>
                      )}
                      {c.phone && (
                        <div style={{ fontSize: "12px", color: "#475569", fontWeight: 600, marginTop: "4px" }}>
                          {c.phone}
                        </div>
                      )}
                    </td>

                    {/* 4. Held Draft Requests */}
                    <td style={styles.td}>
                      {c.heldRequestCount > 0 ? (
                        <span style={styles.heldCountBadge}>
                          {c.heldRequestCount} request{c.heldRequestCount === 1 ? "" : "s"} held in DRAFT
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

                        <button
                          disabled={isRemoving || !c.active}
                          onClick={() => handleRemoveVendor(c)}
                          style={styles.removeBtn}
                        >
                          {isRemoving ? "Removing..." : c.active ? "Remove Vendor" : "Inactive"}
                        </button>

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

type ResolvedLocation = {
  label: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
};

function resolveLocalPartnerLocation(value: string): ResolvedLocation | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/\b\d{5}\b/.test(trimmed)) return null;

  const normalized = normalizeSearch(trimmed);
  const stateCode = stateAliases[normalized];
  if (stateCode && stateCenters[stateCode]) {
    return {
      label: stateNames[stateCode],
      coordinates: stateCenters[stateCode],
    };
  }

  return citySearchIndex[normalized] || null;
}

function isLikelyLocationQuery(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/\b\d{5}\b/.test(trimmed)) return true;
  return Boolean(stateAliases[normalizeSearch(trimmed)]);
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

const stateNames: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

const stateAliases: Record<string, keyof typeof stateNames> = Object.entries(stateNames).reduce(
  (acc, [code, name]) => {
    acc[normalizeSearch(code)] = code as keyof typeof stateNames;
    acc[normalizeSearch(name)] = code as keyof typeof stateNames;
    return acc;
  },
  {} as Record<string, keyof typeof stateNames>,
);

const stateCenters: Record<string, { latitude: number; longitude: number }> = {
  AL: { latitude: 32.8067, longitude: -86.7911 },
  AK: { latitude: 61.3707, longitude: -152.4044 },
  AZ: { latitude: 33.7298, longitude: -111.4312 },
  AR: { latitude: 34.9697, longitude: -92.3731 },
  CA: { latitude: 36.7783, longitude: -119.4179 },
  CO: { latitude: 39.5501, longitude: -105.7821 },
  CT: { latitude: 41.6032, longitude: -73.0877 },
  DE: { latitude: 38.9108, longitude: -75.5277 },
  FL: { latitude: 27.6648, longitude: -81.5158 },
  GA: { latitude: 32.1656, longitude: -82.9001 },
  HI: { latitude: 21.0943, longitude: -157.4983 },
  ID: { latitude: 44.2405, longitude: -114.4788 },
  IL: { latitude: 40.6331, longitude: -89.3985 },
  IN: { latitude: 39.8494, longitude: -86.2583 },
  IA: { latitude: 42.0115, longitude: -93.2105 },
  KS: { latitude: 38.5266, longitude: -96.7265 },
  KY: { latitude: 37.6681, longitude: -84.6701 },
  LA: { latitude: 31.1695, longitude: -91.8678 },
  ME: { latitude: 44.6939, longitude: -69.3819 },
  MD: { latitude: 39.0639, longitude: -76.8021 },
  MA: { latitude: 42.2302, longitude: -71.5301 },
  MI: { latitude: 44.3148, longitude: -85.6024 },
  MN: { latitude: 46.7296, longitude: -94.6859 },
  MS: { latitude: 32.7416, longitude: -89.6787 },
  MO: { latitude: 37.9643, longitude: -91.8318 },
  MT: { latitude: 46.8797, longitude: -110.3626 },
  NE: { latitude: 41.4925, longitude: -99.9018 },
  NV: { latitude: 38.8026, longitude: -116.4194 },
  NH: { latitude: 43.1939, longitude: -71.5724 },
  NJ: { latitude: 40.0583, longitude: -74.4057 },
  NM: { latitude: 34.5199, longitude: -105.8701 },
  NY: { latitude: 43.2994, longitude: -74.2179 },
  NC: { latitude: 35.7596, longitude: -79.0193 },
  ND: { latitude: 47.5515, longitude: -101.002 },
  OH: { latitude: 40.4173, longitude: -82.9071 },
  OK: { latitude: 35.0078, longitude: -97.0929 },
  OR: { latitude: 43.8041, longitude: -120.5542 },
  PA: { latitude: 41.2033, longitude: -77.1945 },
  RI: { latitude: 41.5801, longitude: -71.4774 },
  SC: { latitude: 33.8361, longitude: -81.1637 },
  SD: { latitude: 43.9695, longitude: -99.9018 },
  TN: { latitude: 35.5175, longitude: -86.5804 },
  TX: { latitude: 31.9686, longitude: -99.9018 },
  UT: { latitude: 39.321, longitude: -111.0937 },
  VT: { latitude: 44.5588, longitude: -72.5778 },
  VA: { latitude: 37.4316, longitude: -78.6569 },
  WA: { latitude: 47.7511, longitude: -120.7401 },
  WV: { latitude: 38.5976, longitude: -80.4549 },
  WI: { latitude: 43.7844, longitude: -88.7879 },
  WY: { latitude: 43.076, longitude: -107.2903 },
  DC: { latitude: 38.9072, longitude: -77.0369 },
};

const citySearchIndex: Record<string, ResolvedLocation> = {
  atlanta: { label: "Atlanta, GA", coordinates: { latitude: 33.749, longitude: -84.388 } },
  atlantaga: { label: "Atlanta, GA", coordinates: { latitude: 33.749, longitude: -84.388 } },
  charlotte: { label: "Charlotte, NC", coordinates: { latitude: 35.2271, longitude: -80.8431 } },
  charlottenc: { label: "Charlotte, NC", coordinates: { latitude: 35.2271, longitude: -80.8431 } },
  greensboro: { label: "Greensboro, NC", coordinates: { latitude: 36.0726, longitude: -79.792 } },
  greensboronc: { label: "Greensboro, NC", coordinates: { latitude: 36.0726, longitude: -79.792 } },
  raleigh: { label: "Raleigh, NC", coordinates: { latitude: 35.7796, longitude: -78.6382 } },
  raleighnc: { label: "Raleigh, NC", coordinates: { latitude: 35.7796, longitude: -78.6382 } },
  miami: { label: "Miami, FL", coordinates: { latitude: 25.7617, longitude: -80.1918 } },
  miamifl: { label: "Miami, FL", coordinates: { latitude: 25.7617, longitude: -80.1918 } },
  newyork: { label: "New York, NY", coordinates: { latitude: 40.7128, longitude: -74.006 } },
  newyorkny: { label: "New York, NY", coordinates: { latitude: 40.7128, longitude: -74.006 } },
  losangeles: { label: "Los Angeles, CA", coordinates: { latitude: 34.0522, longitude: -118.2437 } },
  losangelesca: { label: "Los Angeles, CA", coordinates: { latitude: 34.0522, longitude: -118.2437 } },
  dallas: { label: "Dallas, TX", coordinates: { latitude: 32.7767, longitude: -96.797 } },
  dallastx: { label: "Dallas, TX", coordinates: { latitude: 32.7767, longitude: -96.797 } },
  houston: { label: "Houston, TX", coordinates: { latitude: 29.7604, longitude: -95.3698 } },
  houstontx: { label: "Houston, TX", coordinates: { latitude: 29.7604, longitude: -95.3698 } },
  chicago: { label: "Chicago, IL", coordinates: { latitude: 41.8781, longitude: -87.6298 } },
  chicagoil: { label: "Chicago, IL", coordinates: { latitude: 41.8781, longitude: -87.6298 } },
  philadelphia: { label: "Philadelphia, PA", coordinates: { latitude: 39.9526, longitude: -75.1652 } },
  philadelphiapa: { label: "Philadelphia, PA", coordinates: { latitude: 39.9526, longitude: -75.1652 } },
  washington: { label: "Washington, DC", coordinates: { latitude: 38.9072, longitude: -77.0369 } },
  washingtondc: { label: "Washington, DC", coordinates: { latitude: 38.9072, longitude: -77.0369 } },
};

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
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "24px",
    borderBottom: "1px solid var(--line)",
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
  },
  subtitle: {
    fontSize: "14px",
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
    flexWrap: "wrap",
  },
  tabGroup: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
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
    width: "min(100%, 320px)",
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
    minWidth: "920px",
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
  inactiveRow: {
    opacity: 0.62,
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
  removeBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    color: "#B42318",
    border: "1px solid rgba(180, 35, 24, 0.35)",
    padding: "6px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 800,
    cursor: "pointer",
  },
  rightControls: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  addVendorBtn: {
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    border: "1px solid #0F172A",
    padding: "8px 14px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  partnerFilterToolbar: {
    gridTemplateColumns: "minmax(220px, 1.4fr) minmax(150px, 0.8fr) minmax(180px, 1fr) minmax(140px, 0.8fr) minmax(130px, 0.75fr) auto",
    marginBottom: "16px",
  },
  globalStatus: {
    marginBottom: "16px",
    padding: "12px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 800,
  },
  globalStatusSuccess: {
    backgroundColor: "#ECFDF3",
    border: "1px solid rgba(8, 127, 91, 0.24)",
    color: "#087F5B",
  },
  globalStatusError: {
    backgroundColor: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B42318",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "grid",
    placeItems: "center",
    padding: "18px",
    backgroundColor: "rgba(17, 17, 17, 0.42)",
  },
  modal: {
    width: "min(680px, 100%)",
    maxHeight: "calc(100vh - 36px)",
    overflowY: "auto",
    backgroundColor: "#FFFFFF",
    borderRadius: "10px",
    border: "1px solid #E2E8F0",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.18)",
    padding: "22px",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "18px",
    marginBottom: "18px",
  },
  modalTitle: {
    margin: "6px 0 0",
    color: "#0F172A",
    fontSize: "28px",
    fontWeight: 800,
    lineHeight: 1,
  },
  closeBtn: {
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    border: "1px solid #CBD5E1",
    padding: "8px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  },
  modalLabel: {
    display: "grid",
    gap: "6px",
    color: "#64748B",
    fontSize: "11px",
    fontWeight: 800,
    textTransform: "uppercase",
  },
  modalInput: {
    width: "100%",
    minHeight: "42px",
    padding: "0 12px",
    border: "1px solid #CBD5E1",
    borderRadius: "6px",
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: "13px",
    fontWeight: 600,
    textTransform: "none",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "18px",
  },
  cancelBtn: {
    minHeight: "38px",
    padding: "0 14px",
    border: "1px solid #CBD5E1",
    borderRadius: "6px",
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 800,
  },
  saveBtn: {
    minHeight: "38px",
    padding: "0 14px",
    border: "1px solid #0F172A",
    borderRadius: "6px",
    backgroundColor: "#0F172A",
    color: "#FFFFFF",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 800,
  },
};
