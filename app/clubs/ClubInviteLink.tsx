"use client";

import { useMemo, useState } from "react";

type ClubInviteLinkProps = {
  clubName: string;
  clubPath: string;
};

export default function ClubInviteLink({ clubName, clubPath }: ClubInviteLinkProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return clubPath;
    return new URL(clubPath, window.location.origin).toString();
  }, [clubPath]);

  async function copyInvite() {
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
      <button type="button" className="club-invite-link" onClick={() => setOpen(true)}>
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
            <p>Share this link with drivers you want to invite into the club roster.</p>
            <div className="club-invite-url">{inviteUrl}</div>
            <div className="club-invite-actions">
              <button type="button" onClick={copyInvite}>{copied ? "Copied" : "Copy Link"}</button>
              <a href={`mailto:?subject=${encodeURIComponent(`Join ${clubName} on SUPERCAR DASH`)}&body=${encodeURIComponent(inviteUrl)}`}>
                Email Invite
              </a>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
