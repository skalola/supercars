import Link from "next/link";
import { meetEvents } from "./meet-data";

const selectedMeet = meetEvents[0];

export default function MeetsPage() {
  return (
    <main className="meets-page-shell">
      <section className="meets-map-stage" aria-label="Upcoming SUPERCAR DASH meets">
        <div className="meets-map-copy">
          <span>SUPERCAR DASH MEETS</span>
          <h1>Find the next drive.</h1>
          <p>Upcoming owner gatherings, private routes, and garage nights mapped around verified cars.</p>
        </div>

        <div className="meets-filter-strip" aria-label="Meet filters">
          {["Near Me", "Ferrari", "Lamborghini", "McLaren"].map((filter, index) => (
            <Link key={filter} href="/meets" className={index === 1 ? "is-active" : undefined}>
              <span aria-hidden="true" />
              {filter}
            </Link>
          ))}
        </div>

        <div className="meets-map-panel">
          <UsMapGraphic />
          {meetEvents.map((meet) => (
            <Link
              key={meet.slug}
              href={`/meets/${meet.slug}`}
              className={`meets-map-pin is-${meet.accent}`}
              style={{ left: `${meet.mapX}%`, top: `${meet.mapY}%` }}
              aria-label={`${meet.title} in ${meet.city}, ${meet.state}`}
            >
              <span />
              <em>{meet.city.toUpperCase()}</em>
            </Link>
          ))}

          <article className="meets-selected-card">
            <div className="meets-selected-image" />
            <div>
              <span>{selectedMeet.type}</span>
              <h2>{selectedMeet.title}</h2>
              <p>
                {selectedMeet.dateLabel} · {selectedMeet.city}, {selectedMeet.state}
              </p>
              <strong>{selectedMeet.expectedCars} cars expected</strong>
              <div className="meets-selected-actions">
                <Link href={`/meets/${selectedMeet.slug}`}>RSVP</Link>
                <Link href={`/meets/${selectedMeet.slug}`} className="is-primary">
                  View Meet
                </Link>
              </div>
            </div>
          </article>
        </div>

        <aside className="meets-upcoming-panel" aria-label="Upcoming meets">
          <div className="meets-panel-title">
            <span>Live Calendar</span>
            <strong>Upcoming Meets</strong>
          </div>
          <div className="meets-upcoming-list">
            {meetEvents.slice(0, 5).map((meet) => (
              <Link key={meet.slug} href={`/meets/${meet.slug}`} className="meets-upcoming-card">
                <div className="meets-upcoming-image" />
                <div>
                  <strong>{meet.title}</strong>
                  <span>
                    {meet.dateLabel} · {meet.city}, {meet.state}
                  </span>
                  <p>{meet.expectedCars} cars expected</p>
                </div>
                <em aria-hidden="true">&gt;</em>
              </Link>
            ))}
          </div>
          <Link href="#host-a-meet" className="meets-host-button">
            <span aria-hidden="true">+</span>
            Host a Meet
          </Link>
        </aside>
      </section>

      <section id="host-a-meet" className="meets-host-panel">
        <div className="meets-panel-title">
          <span>Host Layer</span>
          <strong>Host a Meet</strong>
        </div>
        <p>Next we will add the form for event name, date, city, allowed makes, capacity, and whether the meet is public or invite-only.</p>
        <Link href="/garage">Prepare Garage</Link>
      </section>
    </main>
  );
}

function UsMapGraphic() {
  return (
    <svg className="meets-map-svg" viewBox="0 0 1000 620" role="img" aria-label="Dark map of United States meet locations">
      <defs>
        <radialGradient id="meetCityGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M91 198 L133 112 L265 93 L393 120 L535 95 L704 128 L846 176 L916 282 L860 383 L826 529 L682 505 L572 454 L448 474 L321 426 L179 433 L118 350 Z"
        fill="rgba(255,255,255,0.025)"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.4"
      />
      <path d="M148 141 L180 430 M272 96 L306 422 M399 120 L423 470 M535 97 L526 452 M700 129 L668 500 M840 178 L780 512" stroke="rgba(255,255,255,0.11)" strokeWidth="1" />
      <path d="M118 350 L318 282 L448 312 L574 264 L704 302 L878 268" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <path d="M180 430 L310 370 L448 474 L574 392 L682 505" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {[
        [120, 144],
        [162, 372],
        [455, 390],
        [575, 268],
        [646, 392],
        [702, 506],
        [776, 244],
        [850, 322],
        [522, 184],
      ].map(([cx, cy]) => (
        <circle key={`${cx}:${cy}`} cx={cx} cy={cy} r="18" fill="url(#meetCityGlow)" opacity="0.46" />
      ))}
    </svg>
  );
}
