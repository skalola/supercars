"use client";

import { cancelHostedMeetAction } from "@/app/actions/meets";

export function HostCancelMeetForm({ meetId, meetTitle }: { meetId: string; meetTitle: string }) {
  return (
    <form
      action={cancelHostedMeetAction}
      className="meet-host-cancel-form"
      onSubmit={(event) => {
        const confirmed = window.confirm(`Cancel "${meetTitle}"? This will keep the page visible but mark the meet as cancelled.`);
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="meetId" value={meetId} />
      <button type="submit">Cancel Meet</button>
    </form>
  );
}
