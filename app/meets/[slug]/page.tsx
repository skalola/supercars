import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rsvpMeetAction } from "@/app/actions/meets";
import { getMeetBySlug } from "../meet-data";

export const dynamic = "force-dynamic";

export default async function MeetDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [meet, session] = await Promise.all([getMeetBySlug(slug), auth()]);

  if (!meet) {
    notFound();
  }

  const garageVehicles = session?.user?.id
    ? await prisma.vehicle.findMany({
        where: { ownerId: session.user.id as string, status: "CLAIMED" },
        include: { model: { include: { make: true } } },
        orderBy: { createdAt: "desc" },
      }).catch(() => [])
    : [];

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
          {meet.id && session?.user?.id ? (
            <form action={rsvpMeetAction} className="meet-rsvp-form">
              <input type="hidden" name="meetId" value={meet.id} />
              <label>
                <span>Vehicle</span>
                <select name="vehicleId" defaultValue="">
                  <option value="">I&apos;ll choose later</option>
                  {garageVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.year} {vehicle.model.make.name} {vehicle.model.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="meet-rsvp-buttons">
                <button type="submit" name="status" value="GOING">Going</button>
                <button type="submit" name="status" value="MAYBE">Maybe</button>
                <button type="submit" name="status" value="CANCELLED">Cancel RSVP</button>
              </div>
            </form>
          ) : meet.id ? (
            <Link href="/login" className="meets-primary-button">
              Sign in to RSVP
            </Link>
          ) : (
            <>
              <p>This preview meet is using demo data. Create a real meet to enable persistent RSVPs.</p>
              <Link href="/meets/host" className="meets-primary-button">
                Host a Meet
              </Link>
            </>
          )}
        </article>

        <article id="cars" className="meet-cars-panel">
          <div className="meets-panel-title">
            <span>Roll Call</span>
            <strong>Cars Attending</strong>
          </div>
          <div className="meet-car-grid">
            {meet.cars.map((car) => (
              <Link key={`${car.owner}:${car.name}`} href={car.ownerHref} className="meet-car-card">
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
