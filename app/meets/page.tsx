import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const meetFormats = [
  {
    title: "Cars & Coffee",
    detail: "Low-friction local gatherings built around verified garage profiles.",
    signal: "Owner discovery",
  },
  {
    title: "Private Drives",
    detail: "Curated routes where each RSVP can attach a specific vehicle passport.",
    signal: "Bring-a-car flow",
  },
  {
    title: "Concours & Showcases",
    detail: "Vehicle history, awards, photos, and service records become part of the event story.",
    signal: "Passport history",
  },
];

const readinessItems = [
  "Claim a VIN-backed vehicle",
  "Add current mileage and photos",
  "Keep service history current",
];

export default async function MeetsPage() {
  const session = await auth();
  const claimedCount = session?.user?.id
    ? await prisma.vehicle.count({
        where: {
          ownerId: session.user.id as string,
          status: "CLAIMED",
        },
      })
    : 0;

  return (
    <main className="meets-page-shell">
      <section className="meets-hero">
        <div>
          <div className="meets-eyebrow">Meets</div>
          <h1>Real-World Events Start In Your Garage</h1>
          <p>
            SUPERCAR DASH meets will connect verified vehicles, owner profiles, and event history without turning clubs into another admin portal.
          </p>
          <div className="meets-actions">
            <Link href="/garage" className="meets-primary-button">
              Prepare Garage
            </Link>
            <Link href="/inventory" className="meets-secondary-button">
              Browse Market
            </Link>
          </div>
        </div>
        <div className="meets-readiness-card">
          <span>Garage Readiness</span>
          <strong>{claimedCount > 0 ? `${claimedCount} claimed` : "No claimed cars"}</strong>
          <p>{claimedCount > 0 ? "Your garage can support vehicle-based event flows." : "Claim a car before RSVP flows go live."}</p>
        </div>
      </section>

      <section className="meets-content-grid">
        <article className="meets-panel wide">
          <div className="meets-panel-heading">
            <span>Meet Formats</span>
            <strong>Display-only foundation</strong>
          </div>
          <div className="meets-format-grid">
            {meetFormats.map((format) => (
              <div key={format.title} className="meets-format-card">
                <span>{format.signal}</span>
                <h2>{format.title}</h2>
                <p>{format.detail}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="meets-panel">
          <div className="meets-panel-heading">
            <span>RSVP Logic</span>
            <strong>Coming after data model</strong>
          </div>
          <p>
            The next functional layer is selecting which claimed vehicle you are bringing, then writing attendance history back to the Vehicle Passport.
          </p>
        </article>

        <article className="meets-panel">
          <div className="meets-panel-heading">
            <span>Before Launch</span>
            <strong>Owner checklist</strong>
          </div>
          <div className="meets-checklist">
            {readinessItems.map((item) => (
              <div key={item}>
                <span aria-hidden="true" />
                <p>{item}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
