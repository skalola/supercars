import Link from "next/link";
import type { GarageMeetSummary } from "./garage-meets";

export default function GarageMeetHistory({ meetSummary, isOwner }: { meetSummary: GarageMeetSummary; isOwner: boolean }) {
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
        <Link href={isOwner ? "/meets/host" : "/meets"}>
          <span>Hosted</span>
          <strong>{meetSummary.stats.hosted}</strong>
        </Link>
        <Link href="/meets">
          <span>Attended</span>
          <strong>{meetSummary.stats.attended}</strong>
        </Link>
        <Link href="/meets">
          <span>Upcoming</span>
          <strong>{meetSummary.stats.upcoming}</strong>
        </Link>
        <Link href="/meets">
          <span>Photos</span>
          <strong>{meetSummary.stats.photos}</strong>
        </Link>
      </div>
    </section>
  );
}
