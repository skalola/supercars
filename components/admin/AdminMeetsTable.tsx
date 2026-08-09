"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteMeetAction, updateMeetStatusAction } from "@/app/actions/admin-meets";

export type AdminMeetRow = {
  id: string;
  title: string;
  href: string;
  host: string;
  date: string;
  location: string;
  type: string;
  visibility: string;
  status: string;
  capacity: number | null;
  rsvpCount: number;
  createdAt: string;
};

export function AdminMeetsTable({ meets }: { meets: AdminMeetRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
        <span>{meets.length.toLocaleString()} total</span>
      </div>

      {message && <div className={`admin-action-message ${message.type}`}>{message.text}</div>}

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
            {meets.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-management-empty">
                  No real meets have been created yet.
                </td>
              </tr>
            ) : (
              meets.map((meet) => {
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
