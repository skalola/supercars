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
import { SUPPORTED_MAKES } from "@/lib/supported-makes";

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
  const typedLocation = locationFilter.trim() ? localLocation || geocodedLocation : null;
  const normalizedLocationFilter = normalizeSearch(locationFilter);

  useEffect(() => {
    const query = locationFilter.trim();

    if (!query || localLocation) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsGeocoding(true);
      setGeocodedLocation(null);
      setLocationMessage("");
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
      <div className="page-header admin-partners-header">
        <div>
          <div className="eyebrow admin-partners-eyebrow">SUPERCAR DASH PARTNER ROUTING REGISTRY</div>
          <h1 className="page-title compact">Partner Contact & Email Resolution Hub</h1>
          <p className="page-copy admin-partners-copy">
            Audit imported dealer listings, resolve missing business emails, and enforce zero guessed emails across all partner outreach.
          </p>
        </div>
        <div className="admin-partners-alert">
          {unresolvedCount} unresolved partner email{unresolvedCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="admin-partners-controls">
        <div className="admin-partners-tabs">
          <button
            type="button"
            onClick={() => setFilterTab("UNRESOLVED")}
            className={`admin-partners-tab${filterTab === "UNRESOLVED" ? " is-active" : ""}`}
          >
            Pending Resolution ({unresolvedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("ALL")}
            className={`admin-partners-tab${filterTab === "ALL" ? " is-active" : ""}`}
          >
            All Registered Partners ({contacts.length})
          </button>
        </div>

        <button type="button" onClick={() => setIsAddOpen(true)} className="admin-partners-add-button">
          Add Vendor
        </button>
      </div>

      <div className="admin-filter-toolbar admin-partners-filter-toolbar" aria-label="Partner filters">
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
          className={`admin-partners-status ${statusMessage.type === "success" ? "is-success" : "is-error"}`}
        >
          {statusMessage.msg}
        </div>
      )}

      {isAddOpen && (
        <div className="admin-partners-modal-backdrop" role="presentation">
          <div className="admin-partners-modal" role="dialog" aria-modal="true" aria-labelledby="add-vendor-title">
            <div className="admin-partners-modal-header">
              <div>
                <div className="eyebrow">Manual Vendor</div>
                <h2 id="add-vendor-title" className="admin-partners-modal-title">Add Vendor</h2>
              </div>
              <button type="button" onClick={() => setIsAddOpen(false)} className="admin-partners-secondary-button">
                Close
              </button>
            </div>

            <div className="admin-partners-modal-grid">
              <label className="admin-partners-modal-label">
                <span>Name</span>
                <input
                  value={vendorForm.name}
                  onChange={(e) => updateVendorForm("name", e.target.value)}
                  placeholder="Ferrari Miami"
                  className="admin-partners-modal-input"
                />
              </label>

              <label className="admin-partners-modal-label">
                <span>Service Type</span>
                <select
                  value={vendorForm.type}
                  onChange={(e) => updateVendorForm("type", e.target.value as PartnerType)}
                  className="admin-partners-modal-input"
                >
                  <option value="DEALER">Dealer</option>
                  <option value="SERVICE_SHOP">Service</option>
                  <option value="TRANSPORTER">Transport</option>
                  <option value="INSURER">Insurance</option>
                </select>
              </label>

              <label className="admin-partners-modal-label">
                <span>Location</span>
                <input
                  value={vendorForm.location}
                  onChange={(e) => updateVendorForm("location", e.target.value)}
                  placeholder="Miami, FL"
                  className="admin-partners-modal-input"
                />
              </label>

              <label className="admin-partners-modal-label">
                <span>Make</span>
                <select
                  value={vendorForm.makeSpecialization}
                  onChange={(e) => updateVendorForm("makeSpecialization", e.target.value)}
                  className="admin-partners-modal-input"
                >
                  <option value="ALL">All</option>
                  {SUPPORTED_MAKES.map((make) => (
                    <option key={make} value={make}>{make}</option>
                  ))}
                </select>
              </label>

              <label className="admin-partners-modal-label">
                <span>Email</span>
                <input
                  type="email"
                  value={vendorForm.email}
                  onChange={(e) => updateVendorForm("email", e.target.value)}
                  placeholder="sales@example.com"
                  className="admin-partners-modal-input"
                />
              </label>

              <label className="admin-partners-modal-label">
                <span>Phone</span>
                <input
                  value={vendorForm.phone}
                  onChange={(e) => updateVendorForm("phone", e.target.value)}
                  placeholder="(305) 555-0100"
                  className="admin-partners-modal-input"
                />
              </label>

              <label className="admin-partners-modal-label is-wide">
                <span>Website</span>
                <input
                  value={vendorForm.website}
                  onChange={(e) => updateVendorForm("website", e.target.value)}
                  placeholder="https://example.com"
                  className="admin-partners-modal-input"
                />
              </label>
            </div>

            <div className="admin-partners-modal-actions">
              <button type="button" onClick={() => setIsAddOpen(false)} className="admin-partners-secondary-button">
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending && processingId === "add-vendor"}
                onClick={handleAddVendor}
                className="admin-partners-save-button"
              >
                {isPending && processingId === "add-vendor" ? "Saving..." : "Save Vendor"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mobile-scroll admin-table-shell admin-partners-table-shell">
        <table className="admin-partners-table">
          <thead>
            <tr>
              <th>PARTNER NAME & TYPE</th>
              <th>SOURCE & DOMAIN</th>
              <th>CONFIDENCE LEVEL</th>
              <th>HELD DRAFT REQUESTS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-partners-empty">
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
                  <tr
                    key={c.id}
                    className={[
                      !c.active ? "is-inactive" : "",
                      isUnresolved ? "is-unresolved" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <td>
                      <div className="admin-partners-name">{c.name}</div>
                      <div className="admin-partners-badge-row">
                        <span style={getTypeBadgeStyle(c.type)}>{c.type}</span>
                        {c.makeSpecialization && (
                          <span className="admin-partners-spec-badge">{c.makeSpecialization}</span>
                        )}
                      </div>
                      {c.location && (
                        <div className="admin-partners-location">
                          {c.location}
                          {c.distanceMiles !== null ? ` · ${Math.round(c.distanceMiles).toLocaleString()} miles away` : ""}
                        </div>
                      )}
                    </td>

                    <td>
                      <span style={getSourceBadgeStyle(c.contactSource)}>
                        {c.contactSource.replace("_", " ")}
                      </span>
                      {c.website && (
                        <div className="admin-partners-website">
                          <a href={c.website} target="_blank" rel="noopener noreferrer">
                            {c.sourceDomain || c.website}
                          </a>
                        </div>
                      )}
                      {c.marketSource && (
                        <div className="admin-partners-source-note">
                          Listing Source: {c.marketSource.name}
                        </div>
                      )}
                    </td>

                    <td>
                      <span style={getConfidenceBadgeStyle(c.confidence)}>
                        {c.confidence}
                      </span>
                      {c.email ? (
                        <div className="admin-partners-email">
                          {c.email}
                        </div>
                      ) : (
                        <div className="admin-partners-missing-email">
                          NO VALID EMAIL
                        </div>
                      )}
                      {c.phone && (
                        <div className="admin-partners-phone">
                          {c.phone}
                        </div>
                      )}
                    </td>

                    <td>
                      {c.heldRequestCount > 0 ? (
                        <span className="admin-partners-held-badge">
                          {c.heldRequestCount} request{c.heldRequestCount === 1 ? "" : "s"} held in DRAFT
                        </span>
                      ) : (
                        <span className="admin-partners-zero-held">0 Held Requests</span>
                      )}
                    </td>

                    <td>
                      <div className="admin-partners-actions">
                        <input
                          type="email"
                          placeholder="Enter verified business email..."
                          value={emailInputs[c.id] || ""}
                          onChange={(e) => setEmailInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          className="admin-partners-email-input"
                        />

                        <div className="admin-partners-resolution-row">
                          <select
                            value={confidenceInputs[c.id] || "MANUAL_REVIEW"}
                            onChange={(e) =>
                              setConfidenceInputs((prev) => ({
                                ...prev,
                                [c.id]: e.target.value as PartnerConfidence,
                              }))
                            }
                            className="admin-partners-confidence-select"
                          >
                            <option value="VERIFIED">VERIFIED</option>
                            <option value="PUBLIC_SOURCE">PUBLIC_SOURCE</option>
                            <option value="MANUAL_REVIEW">MANUAL_REVIEW</option>
                          </select>

                          <button
                            disabled={isBusy}
                            onClick={() => handleResolve(c.id)}
                            className="admin-partners-resolve-button"
                          >
                            {isBusy ? "Saving..." : "Resolve & Dispatch"}
                          </button>
                        </div>

                        <button
                          disabled={isRemoving || !c.active}
                          onClick={() => handleRemoveVendor(c)}
                          className="admin-partners-remove-button"
                        >
                          {isRemoving ? "Removing..." : c.active ? "Remove Vendor" : "Inactive"}
                        </button>

                        {msg && (
                          <div
                            className={`admin-partners-row-message ${msg.type === "success" ? "is-success" : "is-error"}`}
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
