"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { deleteMeetAction, updateMeetStatusAction } from "@/app/actions/admin-meets";

export type AdminMeetRow = {
  id: string;
  title: string;
  href: string;
  host: string;
  date: string;
  startsAtIso: string;
  location: string;
  city: string;
  state: string;
  type: string;
  visibility: string;
  rawStatus: string;
  status: string;
  capacity: number | null;
  rsvpCount: number;
  createdAt: string;
  createdAtIso: string;
};

export function AdminMeetsTable({ meets, referenceTimeIso }: { meets: AdminMeetRow[]; referenceTimeIso: string }) {
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [capacityFilter, setCapacityFilter] = useState("");

  const statusOptions = useMemo(
    () => Array.from(new Set(meets.map((meet) => meet.rawStatus))).sort(),
    [meets]
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(meets.map((meet) => meet.type))).sort(),
    [meets]
  );
  const locationOptions = useMemo(
    () => Array.from(new Set(meets.map((meet) => `${meet.city}, ${meet.state}`))).sort(),
    [meets]
  );

  const filteredMeets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const now = new Date(referenceTimeIso).getTime();

    return meets.filter((meet) => {
      if (statusFilter && meet.rawStatus !== statusFilter) return false;
      if (typeFilter && meet.type !== typeFilter) return false;
      if (locationFilter && `${meet.city}, ${meet.state}` !== locationFilter) return false;

      const startsAt = new Date(meet.startsAtIso).getTime();
      if (dateFilter === "UPCOMING" && startsAt < now) return false;
      if (dateFilter === "PAST" && startsAt >= now) return false;
      if (dateFilter === "NEXT_30") {
        const thirtyDays = 1000 * 60 * 60 * 24 * 30;
        if (startsAt < now || startsAt > now + thirtyDays) return false;
      }

      if (capacityFilter === "FULL" && (!meet.capacity || meet.rsvpCount < meet.capacity)) return false;
      if (capacityFilter === "OPEN" && meet.capacity && meet.rsvpCount >= meet.capacity) return false;
      if (capacityFilter === "NO_CAPACITY" && meet.capacity) return false;

      if (query) {
        const haystack = [meet.title, meet.host, meet.location, meet.type, meet.visibility, meet.status]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [capacityFilter, dateFilter, locationFilter, meets, referenceTimeIso, searchQuery, statusFilter, typeFilter]);

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("");
    setTypeFilter("");
    setLocationFilter("");
    setDateFilter("");
    setCapacityFilter("");
  };

  const updateStatus = (meet: AdminMeetRow, status: "PUBLISHED" | "HIDDEN" | "CANCELLED" | "COMPLETED") => {
    const confirmed = window.confirm(`Mark "${meet.title}" as ${status.toLowerCase()}?`);
    if (!confirmed) return;

    setProcessingId(meet.id);
    setMessage(null);
    startTransition(async () => {
      const result = await updateMeetStatusAction(meet.id, status);
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      setProcessingId(null);
    });
  };

  const deleteMeet = (meet: AdminMeetRow) => {
    const confirmed = window.confirm(`Permanently delete "${meet.title}"? This also removes RSVPs and meet photos.`);
    if (!confirmed) return;

    setProcessingId(meet.id);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteMeetAction(meet.id);
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      setProcessingId(null);
    });
  };

  return (
    <section className="surface-panel admin-management-panel">
      <div className="admin-management-panel-header">
        <div>
          <p className="eyebrow">Meets</p>
          <h2>Meet Operations</h2>
        </div>
        <span>
          {filteredMeets.length.toLocaleString()} shown of {meets.length.toLocaleString()} total
        </span>
      </div>

      {message && <div className={`admin-action-message ${message.type}`}>{message.text}</div>}

      <div className="admin-filter-toolbar admin-meet-filter-toolbar" aria-label="Meet filters">
        <label>
          <span>Search</span>
          <input
            type="search"
            placeholder="Meet, host, city, format"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Format</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All Formats</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Location</span>
          <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
            <option value="">All Locations</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Date</span>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            <option value="">All Dates</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="NEXT_30">Next 30 Days</option>
            <option value="PAST">Past</option>
          </select>
        </label>
        <label>
          <span>Capacity</span>
          <select value={capacityFilter} onChange={(event) => setCapacityFilter(event.target.value)}>
            <option value="">All Capacity</option>
            <option value="OPEN">Open Spots</option>
            <option value="FULL">Full</option>
            <option value="NO_CAPACITY">No Limit</option>
          </select>
        </label>
        <button type="button" onClick={resetFilters}>Reset</button>
      </div>

      <div className="mobile-scroll admin-management-table-shell">
        <table className="admin-management-table">
          <thead>
            <tr>
              <th>Meet</th>
              <th>Host</th>
              <th>Date</th>
              <th>Location</th>
              <th>Status</th>
              <th>RSVPs</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMeets.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-management-empty">
                  No meets match the current filters.
                </td>
              </tr>
            ) : (
              filteredMeets.map((meet) => {
                const isBusy = isPending && processingId === meet.id;
                return (
                  <tr key={meet.id}>
                    <td data-label="Meet">
                      <strong>{meet.title}</strong>
                      <span>{meet.type} · {meet.visibility}</span>
                      <Link href={meet.href} className="admin-inline-link">View page</Link>
                    </td>
                    <td data-label="Host">{meet.host}</td>
                    <td data-label="Date">{meet.date}</td>
                    <td data-label="Location">{meet.location}</td>
                    <td data-label="Status">
                      <span className="admin-status-pill">{meet.status}</span>
                    </td>
                    <td data-label="RSVPs">
                      {meet.rsvpCount}
                      {meet.capacity ? ` / ${meet.capacity}` : ""}
                    </td>
                    <td data-label="Created">{meet.createdAt}</td>
                    <td data-label="Actions">
                      <div className="admin-row-actions">
                        <button type="button" className="admin-secondary-button" disabled={isBusy} onClick={() => updateStatus(meet, "PUBLISHED")}>
                          Publish
                        </button>
                        <button type="button" className="admin-secondary-button" disabled={isBusy} onClick={() => updateStatus(meet, "COMPLETED")}>
                          Complete
                        </button>
                        <button type="button" className="admin-secondary-button" disabled={isBusy} onClick={() => updateStatus(meet, "HIDDEN")}>
                          Hide
                        </button>
                        <button type="button" className="admin-danger-button" disabled={isBusy} onClick={() => updateStatus(meet, "CANCELLED")}>
                          Cancel
                        </button>
                        <button type="button" className="admin-danger-button" disabled={isBusy} onClick={() => deleteMeet(meet)}>
                          Delete
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

function formatStatus(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
