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
        <article>
          <span>Hosted</span>
          <strong>{meetSummary.stats.hosted}</strong>
        </article>
        <article>
          <span>Attended</span>
          <strong>{meetSummary.stats.attended}</strong>
        </article>
        <article>
          <span>Upcoming</span>
          <strong>{meetSummary.stats.upcoming}</strong>
        </article>
        <article>
          <span>Completed</span>
          <strong>{meetSummary.stats.completed}</strong>
        </article>
        <article>
          <span>Photos</span>
          <strong>{meetSummary.stats.photos}</strong>
        </article>
      </div>

      <div className="garage-meet-columns">
        <article>
          <div>
            <span>Hosted</span>
            <Link href={isOwner ? "/meets/host" : "/meets"}>{isOwner ? "Host a Meet" : "View Meets"}</Link>
          </div>
          <GarageMeetList items={meetSummary.hosted} emptyText="Hosted meets will appear here." />
        </article>
        <article>
          <div>
            <span>Attended</span>
            <Link href="/meets">Find Meets</Link>
          </div>
          <GarageMeetList items={meetSummary.attended} emptyText="RSVP history will appear here." />
        </article>
      </div>

      <article className="garage-meet-photo-strip">
        <div>
          <span>Event Gallery</span>
          <Link href="/meets">Open Meets</Link>
        </div>
        {meetSummary.photos.length > 0 ? (
          <div>
            {meetSummary.photos.map((photo) => (
              <Link key={`${photo.href}:${photo.url}`} href={photo.href} style={{ backgroundImage: `url("${photo.url}")` }}>
                <span>{photo.caption || photo.meetTitle}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p>Completed meet photos will appear here.</p>
        )}
      </article>
    </section>
  );
}

function GarageMeetList({ items, emptyText }: { items: Array<{ title: string; href: string; meta: string; status: string }>; emptyText: string }) {
  if (items.length === 0) return <p>{emptyText}</p>;
  return (
    <div className="garage-meet-list">
      {items.map((item) => (
        <Link key={`${item.href}:${item.status}`} href={item.href}>
          <strong>{item.title}</strong>
          <span>{item.meta}</span>
          <em>{item.status}</em>
        </Link>
      ))}
    </div>
  );
}
