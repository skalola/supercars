"use client";

import { useMemo, useState, useTransition } from "react";
import { removeListingAction, unpublishListingAction } from "@/app/actions/admin-management";

export type AdminListingRow = {
  id: string;
  imageUrl: string | null;
  vehicleLabel: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  status: string;
  validationStatus: string;
  priceStatus: string;
  freshnessStatus: string;
  price: string;
  mileage: string;
  dealerName: string;
  location: string;
  sourceName: string;
  sourceWebsite: string | null;
  sourceType: string | null;
  externalListingId: string | null;
  url: string | null;
  updatedAt: string;
  updatedAtIso: string;
};

export function AdminListingsTable({ listings }: { listings: AdminListingRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [makeFilter, setMakeFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const makeOptions = useMemo(
    () => Array.from(new Set(listings.map((listing) => listing.make))).sort(),
    [listings]
  );
  const modelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          listings
            .filter((listing) => !makeFilter || listing.make === makeFilter)
            .map((listing) => listing.model)
        )
      ).sort(),
    [listings, makeFilter]
  );
  const yearOptions = useMemo(
    () => Array.from(new Set(listings.map((listing) => listing.year))).sort((a, b) => b - a),
    [listings]
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(listings.map((listing) => listing.status))).sort(),
    [listings]
  );
  const sourceOptions = useMemo(
    () => Array.from(new Set(listings.map((listing) => listing.sourceName))).sort(),
    [listings]
  );

  const filteredListings = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const maxAgeDays = dateFilter ? Number(dateFilter) : null;

    return listings.filter((listing) => {
      if (makeFilter && listing.make !== makeFilter) return false;
      if (modelFilter && listing.model !== modelFilter) return false;
      if (yearFilter && listing.year.toString() !== yearFilter) return false;
      if (statusFilter && listing.status !== statusFilter) return false;
      if (qualityFilter === "PUBLIC_READY" && !isPublicReady(listing)) return false;
      if (qualityFilter === "REJECTED" && isPublicReady(listing)) return false;
      if (qualityFilter === "NEEDS_PRICE" && listing.priceStatus !== "PRICE_MISSING") return false;
      if (qualityFilter === "NEEDS_IMAGE" && listing.freshnessStatus !== "INACTIVE") return false;
      if (qualityFilter === "VIN_MODEL_ISSUE" && !/MISMATCH|VIN|NEEDS_REVIEW/i.test(listing.validationStatus)) return false;
      if (sourceFilter && listing.sourceName !== sourceFilter) return false;

      if (maxAgeDays) {
        const updatedAt = new Date(listing.updatedAtIso).getTime();
        const ageDays = (now - updatedAt) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(ageDays) && ageDays > maxAgeDays) return false;
      }

      if (trimmedQuery) {
        const haystack = [
          listing.vehicleLabel,
          listing.vin,
          listing.dealerName,
          listing.location,
          listing.sourceName,
          listing.externalListingId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(trimmedQuery)) return false;
      }

      return true;
    });
  }, [dateFilter, listings, makeFilter, modelFilter, qualityFilter, searchQuery, sourceFilter, statusFilter, yearFilter]);

  const resetFilters = () => {
    setSearchQuery("");
    setMakeFilter("");
    setModelFilter("");
    setYearFilter("");
    setStatusFilter("");
    setQualityFilter("");
    setSourceFilter("");
    setDateFilter("");
  };

  const runListingAction = (
    listing: AdminListingRow,
    actionType: "unpublish" | "remove"
  ) => {
    const label = `${listing.vehicleLabel} (${listing.externalListingId || listing.id})`;
    const prompt =
      actionType === "unpublish"
        ? `Unpublish ${label}? It will be hidden from inventory but retained in the database.`
        : `Permanently remove ${label}? This cannot be undone.`;

    if (!window.confirm(prompt)) return;

    setProcessingId(`${actionType}:${listing.id}`);
    setMessage(null);

    startTransition(async () => {
      const result =
        actionType === "unpublish"
          ? await unpublishListingAction(listing.id)
          : await removeListingAction(listing.id);

      setMessage({ type: result.success ? "success" : "error", text: result.message });
      setProcessingId(null);
    });
  };

  return (
    <section className="surface-panel admin-management-panel">
      <div className="admin-management-panel-header">
        <div>
          <p className="eyebrow">Listings</p>
          <h2>Vehicle Listings</h2>
        </div>
        <span>
          {filteredListings.length.toLocaleString()} shown of {listings.length.toLocaleString()} total
        </span>
      </div>

      {message && (
        <div className={`admin-action-message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="admin-filter-toolbar" aria-label="Listing filters">
        <label>
          <span>Search</span>
          <input
            type="search"
            placeholder="VIN, dealer, location, source"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <label>
          <span>Make</span>
          <select
            value={makeFilter}
            onChange={(event) => {
              setMakeFilter(event.target.value);
              setModelFilter("");
            }}
          >
            <option value="">All Makes</option>
            {makeOptions.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Model</span>
          <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
            <option value="">All Models</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Year</span>
          <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
            <option value="">All Years</option>
            {yearOptions.map((year) => (
              <option key={year} value={year.toString()}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Quality</span>
          <select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)}>
            <option value="">All Quality</option>
            <option value="PUBLIC_READY">Public Ready</option>
            <option value="REJECTED">Inactive / Rejected</option>
            <option value="NEEDS_PRICE">Missing Price</option>
            <option value="NEEDS_IMAGE">Missing Image</option>
            <option value="VIN_MODEL_ISSUE">VIN / Model Issue</option>
          </select>
        </label>

        <label>
          <span>Source</span>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="">All Sources</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Date</span>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            <option value="">Any Time</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </label>

        <button type="button" onClick={resetFilters}>
          Reset
        </button>
      </div>

      <div className="mobile-scroll admin-management-table-shell">
        <table className="admin-management-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Status</th>
              <th>Quality</th>
              <th>Price</th>
              <th>Mileage</th>
              <th>Dealer</th>
              <th>Location</th>
              <th>Source</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredListings.length === 0 ? (
              <tr>
                <td colSpan={10} className="admin-management-empty">
                  No listings match the selected filters.
                </td>
              </tr>
            ) : (
              filteredListings.map((listing) => {
                const isUnpublishing = isPending && processingId === `unpublish:${listing.id}`;
                const isRemoving = isPending && processingId === `remove:${listing.id}`;
                const isRemoved = listing.status === "REMOVED";
                const publicReady = isPublicReady(listing);
                const qualityReason = getQualityReason(listing);

                return (
                  <tr key={listing.id}>
                    <td className="admin-listing-vehicle-cell" data-label="Vehicle">
                      <strong>{listing.vehicleLabel}</strong>
                      <span className="admin-listing-identifier">{listing.vin || listing.externalListingId || listing.id}</span>
                    </td>
                    <td className="admin-listing-status-cell" data-label="Status">
                      <span className={`admin-status-pill ${isRemoved ? "is-muted" : ""}`}>
                        {listing.status}
                      </span>
                    </td>
                    <td className="admin-listing-quality-cell" data-label="Quality">
                      <span className={`admin-status-pill ${publicReady ? "" : "is-muted"}`}>
                        {publicReady ? "PUBLIC READY" : "REJECTED"}
                      </span>
                      <span className="admin-listing-identifier">{qualityReason}</span>
                    </td>
                    <td className="admin-listing-money-cell" data-label="Price">{listing.price}</td>
                    <td className="admin-listing-compact-cell" data-label="Mileage">{listing.mileage}</td>
                    <td data-label="Dealer">{listing.dealerName}</td>
                    <td data-label="Location">{listing.location}</td>
                    <td data-label="Source">
                      {listing.url ? (
                        <a href={listing.url} target="_blank" rel="noopener noreferrer">
                          {listing.sourceName}
                        </a>
                      ) : (
                        listing.sourceName
                      )}
                    </td>
                    <td className="admin-listing-compact-cell" data-label="Updated">{listing.updatedAt}</td>
                    <td className="admin-listing-actions-cell" data-label="Actions">
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-secondary-button"
                          onClick={() => runListingAction(listing, "unpublish")}
                          disabled={isRemoved || isUnpublishing || isRemoving}
                        >
                          {isUnpublishing ? "Unpublishing" : "Unpublish"}
                        </button>
                        <button
                          type="button"
                          className="admin-danger-button"
                          onClick={() => runListingAction(listing, "remove")}
                          disabled={isUnpublishing || isRemoving}
                        >
                          {isRemoving ? "Removing" : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function isPublicReady(listing: AdminListingRow) {
  return (
    listing.status === "ACTIVE" &&
    listing.validationStatus === "VALID" &&
    listing.priceStatus !== "PRICE_INVALID" &&
    listing.priceStatus !== "PRICE_MISSING" &&
    listing.freshnessStatus !== "INACTIVE" &&
    Boolean(listing.url)
  );
}

function getQualityReason(listing: AdminListingRow) {
  if (isPublicReady(listing)) return "VIN, price, image, and listing URL verified";
  const reasons = [
    listing.validationStatus !== "VALID" ? listing.validationStatus : null,
    listing.priceStatus !== "VALID_PRICE" ? listing.priceStatus : null,
    listing.freshnessStatus !== "ACTIVE" ? listing.freshnessStatus : null,
    listing.status !== "ACTIVE" ? listing.status : null,
    !listing.url ? "SOURCE_URL_MISSING" : null,
  ].filter(Boolean);
  return reasons.join(" / ") || "Not public-ready";
}
