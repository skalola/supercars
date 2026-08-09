import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeetBySlug, meetEvents } from "../meet-data";

export function generateStaticParams() {
  return meetEvents.map((meet) => ({ slug: meet.slug }));
}

export default async function MeetDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meet = getMeetBySlug(slug);

  if (!meet) {
    notFound();
  }

  return (
    <main className="meet-detail-shell">
      <section className="meet-detail-hero">
        <div className="meet-detail-hero-copy">
          <Link href="/meets" className="meet-back-link">
            &lt; Back to Meets
          </Link>
          <span>{meet.type}</span>
          <h1>{meet.title}</h1>
          <p>{meet.description}</p>
          <div className="meet-detail-actions">
            <Link href="#rsvp" className="meets-primary-button">
              RSVP
            </Link>
            <Link href="#cars" className="meets-secondary-button">
              Cars Attending
            </Link>
          </div>
        </div>
        <aside className="meet-status-card">
          <span>{meet.status}</span>
          <strong>
            {meet.dateLabel} · {meet.timeLabel}
          </strong>
          <p>
            {meet.city}, {meet.state}
          </p>
        </aside>
      </section>

      <section className="meet-detail-layout">
        <article className="meet-info-panel">
          <div className="meets-panel-title">
            <span>Location</span>
            <strong>{meet.locationName}</strong>
          </div>
          <div className="meet-location-map">
            <span style={{ left: `${meet.mapX}%`, top: `${meet.mapY}%` }} />
          </div>
          <p>{meet.locationDetail}</p>
          <div className="meet-info-grid">
            <div>
              <span>Host</span>
              <strong>{meet.host}</strong>
            </div>
            <div>
              <span>Expected Cars</span>
              <strong>{meet.expectedCars}</strong>
            </div>
            <div>
              <span>Allowed Makes</span>
              <strong>{meet.allowedMakes.join(" · ")}</strong>
            </div>
          </div>
        </article>

        <article id="rsvp" className="meet-rsvp-panel">
          <div className="meets-panel-title">
            <span>RSVP</span>
            <strong>Bring a verified car</strong>
          </div>
          <p>Selecting a claimed garage vehicle and writing event history back to the owner profile is the next functional layer.</p>
          <Link href="/garage" className="meets-primary-button">
            Prepare Garage
          </Link>
        </article>

        <article id="cars" className="meet-cars-panel">
          <div className="meets-panel-title">
            <span>Roll Call</span>
            <strong>Cars Attending</strong>
          </div>
          <div className="meet-car-grid">
            {meet.cars.map((car) => (
              <Link key={`${car.owner}:${car.name}`} href="/garage" className="meet-car-card">
                <div className="meet-car-image" style={{ backgroundImage: `url("${car.image}")` }} />
                <div>
                  <span>{car.owner}</span>
                  <strong>{car.name}</strong>
                </div>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
