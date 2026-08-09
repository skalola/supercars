"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteMeetPhotoAction } from "@/app/actions/admin-meets";

export type AdminMeetPhotoRow = {
  id: string;
  url: string;
  caption: string | null;
  meetTitle: string;
  meetHref: string;
  userLabel: string;
  vehicleLabel: string | null;
  vehicleHref: string | null;
  createdAt: string;
};

export function AdminMeetPhotoModeration({ photos }: { photos: AdminMeetPhotoRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const deletePhoto = (photo: AdminMeetPhotoRow) => {
    const confirmed = window.confirm(`Remove this photo from "${photo.meetTitle}"?`);
    if (!confirmed) return;

    setProcessingId(photo.id);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteMeetPhotoAction(photo.id);
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      setProcessingId(null);
    });
  };

  return (
    <section className="surface-panel admin-management-panel admin-meet-photo-panel">
      <div className="admin-management-panel-header">
        <div>
          <p className="eyebrow">Moderation</p>
          <h2>Meet Photos</h2>
        </div>
        <span>{photos.length.toLocaleString()} recent</span>
      </div>

      {message && <div className={`admin-action-message ${message.type}`}>{message.text}</div>}

      {photos.length === 0 ? (
        <div className="admin-management-empty">No meet photos have been uploaded yet.</div>
      ) : (
        <div className="admin-meet-photo-grid">
          {photos.map((photo) => {
            const isBusy = isPending && processingId === photo.id;
            return (
              <article key={photo.id} className="admin-meet-photo-card">
                <a href={photo.url} target="_blank" rel="noreferrer" className="admin-meet-photo-image" style={{ backgroundImage: `url("${photo.url}")` }}>
                  <span>Open Image</span>
                </a>
                <div className="admin-meet-photo-body">
                  <div>
                    <strong>{photo.caption || "Untitled photo"}</strong>
                    <span>{photo.createdAt}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Meet</dt>
                      <dd><Link href={photo.meetHref}>{photo.meetTitle}</Link></dd>
                    </div>
                    <div>
                      <dt>Uploaded By</dt>
                      <dd>{photo.userLabel}</dd>
                    </div>
                    {photo.vehicleHref && photo.vehicleLabel ? (
                      <div>
                        <dt>Vehicle</dt>
                        <dd><Link href={photo.vehicleHref}>{photo.vehicleLabel}</Link></dd>
                      </div>
                    ) : null}
                  </dl>
                  <button type="button" className="admin-danger-button" disabled={isBusy} onClick={() => deletePhoto(photo)}>
                    Delete Photo
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
