"use client";

import { useState, useTransition } from "react";
import { createClubInviteAction } from "@/app/actions/clubs";

type ClubInviteLinkProps = {
  clubId: string;
  clubName: string;
  inviterName: string;
};

export default function ClubInviteLink({ clubId, clubName, inviterName }: ClubInviteLinkProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function openInviteModal() {
    setOpen(true);
    setError("");
    if (inviteUrl) return;
    const formData = new FormData();
    formData.set("clubId", clubId);
    startTransition(async () => {
      try {
        const result = await createClubInviteAction(formData);
        setInviteUrl(new URL(result.invitePath, window.location.origin).toString());
      } catch {
        setError("Invite link could not be created. Try again in a moment.");
      }
    });
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button type="button" className="club-invite-link" onClick={openInviteModal}>
        Invite Members
      </button>
      {open ? (
        <div className="club-invite-modal-backdrop">
          <section className="club-invite-modal" role="dialog" aria-modal="true" aria-labelledby="club-invite-title">
            <header>
              <div>
                <span>Club Invite</span>
                <h2 id="club-invite-title">{clubName}</h2>
              </div>
              <button type="button" aria-label="Close invite modal" onClick={() => setOpen(false)}>×</button>
            </header>
            <p>Share this invite with drivers you want to add directly to {clubName}. The link opens a cinematic join page and signs them into this club.</p>
            <div className="club-invite-byline">Invited by {inviterName}</div>
            <div className="club-invite-url">{isPending ? "Creating secure invite link..." : error || inviteUrl}</div>
            <div className="club-invite-actions">
              <button type="button" onClick={copyInvite} disabled={!inviteUrl || isPending}>{copied ? "Copied" : "Copy Link"}</button>
              <a
                aria-disabled={!inviteUrl}
                href={inviteUrl ? `mailto:?subject=${encodeURIComponent(`Join ${clubName} on SUPERCAR DASH`)}&body=${encodeURIComponent(`${inviterName} invited you to join ${clubName} on SUPERCAR DASH.\n\n${inviteUrl}`)}` : undefined}
              >
                Email Invite
              </a>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
