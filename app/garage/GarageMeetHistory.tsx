"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GarageMeetSummary } from "./garage-meets";

type ActivityTab = "hosted" | "attended" | "upcoming";

const activityLabels: Record<ActivityTab, { label: string; title: string; empty: string }> = {
  hosted: {
    label: "Hosted",
    title: "Hosted Meets",
    empty: "No hosted meets yet.",
  },
  attended: {
    label: "Attended",
    title: "Attended Meets",
    empty: "No attended meets yet.",
  },
  upcoming: {
    label: "Upcoming",
    title: "Upcoming Registered Meets",
    empty: "No upcoming registered meets yet.",
  },
};

export default function GarageMeetHistory({ meetSummary, isOwner }: { meetSummary: GarageMeetSummary; isOwner: boolean }) {
  const [activeTab, setActiveTab] = useState<ActivityTab | null>(null);
  const activeItems = activeTab ? meetSummary[activeTab] : [];
  const activeMeta = activeTab ? activityLabels[activeTab] : null;

  useEffect(() => {
    if (!activeTab) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveTab(null);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [activeTab]);

  const statCards = useMemo(
    () =>
      (Object.keys(activityLabels) as ActivityTab[]).map((key) => ({
        key,
        ...activityLabels[key],
        value: meetSummary.stats[key],
      })),
    [meetSummary.stats],
  );
  const featuredMeet =
    meetSummary.upcoming[0] || meetSummary.hosted[0] || meetSummary.attended[0] || null;
  const featuredMeetLabel = meetSummary.upcoming[0]
    ? "Next Registered Meet"
    : meetSummary.hosted[0]
      ? "Latest Hosted Meet"
      : "Latest Attended Meet";

  return (
    <section className="garage-meet-history" aria-label="Garage meet history">
      <div className="garage-meet-heading">
        <div>
          <span>Meets</span>
          <strong>Driver Activity</strong>
        </div>
        <Link href={isOwner ? "/meets/host" : "/meets"}>{isOwner ? "Host a Meet" : "View Meets"}</Link>
      </div>

      <div className="garage-meet-stat-grid" aria-label="Meet summary">
        {statCards.map((card) => (
          <button
            key={card.key}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setActiveTab(card.key)}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </button>
        ))}
      </div>

      <div className="garage-meet-preview-card">
        {featuredMeet ? (
          <Link href={featuredMeet.href}>
            <div>
              <span>{featuredMeetLabel}</span>
              <strong>{featuredMeet.title}</strong>
              <p>{featuredMeet.location}</p>
            </div>
            <div>
              <em>{featuredMeet.badge}</em>
              <span>{featuredMeet.date}</span>
            </div>
          </Link>
        ) : (
          <div>
            <span>Next Meet</span>
            <strong>No meet activity yet</strong>
            <p>{isOwner ? "Host or RSVP to a meet to add activity to this garage." : "This public garage has not attended any meets yet."}</p>
            <Link href={isOwner ? "/meets/host" : "/meets"}>{isOwner ? "Host a Meet" : "Explore Meets"}</Link>
          </div>
        )}
      </div>

      {activeTab && activeMeta ? (
        <div className="garage-activity-modal" role="dialog" aria-modal="true" aria-labelledby="garage-activity-modal-title">
          <button type="button" className="garage-activity-modal-backdrop" aria-label="Close driver activity" onClick={() => setActiveTab(null)} />
          <div className="garage-activity-modal-panel">
            <div className="garage-activity-modal-header">
              <div>
                <span>Driver Activity</span>
                <h2 id="garage-activity-modal-title">{activeMeta.title}</h2>
              </div>
              <button type="button" aria-label="Close driver activity" onClick={() => setActiveTab(null)}>
                Close
              </button>
            </div>

            {activeItems.length > 0 ? (
              <div className="garage-activity-modal-list">
                {activeItems.map((item) => (
                  <Link key={`${activeTab}:${item.id}`} href={item.href} onClick={() => setActiveTab(null)}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.location}</span>
                    </div>
                    <div>
                      <em>{item.badge}</em>
                      <span>{item.date}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="garage-activity-modal-empty">
                <p>{activeMeta.empty}</p>
                <Link href={activeTab === "hosted" && isOwner ? "/meets/host" : "/meets"} onClick={() => setActiveTab(null)}>
                  {activeTab === "hosted" && isOwner ? "Host a Meet" : "Explore Meets"}
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
