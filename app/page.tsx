import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { getHomepageSummary, type HomepageGarageVehicle } from "@/lib/garage/homepage-summary";

export default async function HomePage() {
  const session = await auth();
  const summary = await getHomepageSummary(session?.user);
  const primaryGarageHref = session?.user ? "/garage" : "/login";

  return (
    <main className="garage-home">
      <section className="garage-home-hero">
        <Image
          src="/images/garage-home-hero.png?v=garage-2"
          alt=""
          fill
          priority
          sizes="100vw"
          className="garage-home-hero-image"
          unoptimized
        />
        <div className="garage-home-shade" aria-hidden="true" />

        <div className="garage-home-content">
          <div className="garage-home-copy">
            <p className="garage-home-eyebrow">SUPERCAR DASH</p>
            <h1>Your Digital Garage</h1>
            <p>Build, track, and share the story of your real cars.</p>
            <div className="garage-home-actions">
              <Link href={primaryGarageHref} className="garage-home-primary">
                Enter My Garage
                <span aria-hidden="true">&gt;</span>
              </Link>
              <Link href="/meets" className="garage-home-secondary">
                Explore Meets
              </Link>
            </div>
          </div>

          <div className="garage-home-kpis" aria-label="Garage status">
            <KpiCard label={summary.garageValueLabel} value={formatCurrency(summary.garageValue)} detail="Synced from verified cars" icon="$" />
            <KpiCard label={summary.nextServiceLabel} value={summary.nextServiceDetail} detail="Maintenance status" icon="S" />
            <KpiCard label={summary.upcomingMeetLabel} value={summary.upcomingMeetDetail} detail="Real-world club layer" icon="+" />
            <KpiCard label="Passport" value={summary.passportLabel} detail={summary.passportDetail} icon="V" />
          </div>

          <GarageRail
            ownedVehicles={summary.ownedVehicles}
            dreamVehicles={summary.dreamVehicles}
            previousVehicles={summary.previousVehicles}
          />
        </div>
      </section>

      <section className="garage-home-lower" aria-label="Ownership discovery">
        <article className="garage-home-panel">
          <div>
            <span>Featured Garages</span>
            <Link href={summary.username ? `/garage/${summary.username}` : "/garage"}>View garage</Link>
          </div>
          <div className="garage-home-mini-grid">
            {summary.featuredVehicles.slice(0, 3).map((vehicle) => (
              <Link key={vehicle.id} href={vehicle.href} className="garage-home-mini-card">
                {vehicle.imageUrl ? (
                  <Image src={vehicle.imageUrl} alt="" fill sizes="(max-width: 760px) 33vw, 180px" unoptimized />
                ) : null}
                <span>{vehicle.label}</span>
              </Link>
            ))}
          </div>
        </article>

        <article id="nearby-meets" className="garage-home-panel">
          <div>
            <span>Nearby Meets</span>
            <Link href="/meets">Open meets</Link>
          </div>
          <div className="garage-home-meet-card">
            <strong>Garage-first meets</strong>
            <p>Select which car you are bringing, RSVP, and keep event history attached to the Vehicle Passport.</p>
          </div>
        </article>

        <article className="garage-home-panel">
          <div>
            <span>Ownership Activity</span>
            <Link href="/garage">Manage</Link>
          </div>
          <div className="garage-home-activity-list">
            {summary.activityItems.map((item) => (
              <Link key={`${item.href}:${item.label}`} href={item.href}>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
}) {
  return (
    <article className="garage-home-kpi">
      <span className="garage-home-kpi-icon" aria-hidden="true">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function GarageRail({
  ownedVehicles,
  dreamVehicles,
  previousVehicles,
}: {
  ownedVehicles: HomepageGarageVehicle[];
  dreamVehicles: HomepageGarageVehicle[];
  previousVehicles: HomepageGarageVehicle[];
}) {
  return (
    <div className="garage-home-rail" aria-label="Garage collection">
      <GarageRailGroup title="Owned" vehicles={ownedVehicles} emptyText="Claim a VIN-backed car" />
      <GarageRailGroup title="Dream Garage" vehicles={dreamVehicles} emptyText="Save models to track" wide />
      <GarageRailGroup title="Previously Owned" vehicles={previousVehicles} emptyText="Garage 2.0 history" />
    </div>
  );
}

function GarageRailGroup({
  title,
  vehicles,
  emptyText,
  wide = false,
}: {
  title: string;
  vehicles: HomepageGarageVehicle[];
  emptyText: string;
  wide?: boolean;
}) {
  const visibleVehicles = vehicles.slice(0, wide ? 3 : 1);

  return (
    <section className={wide ? "garage-home-rail-group wide" : "garage-home-rail-group"}>
      <div className="garage-home-rail-heading">
        <span>{title}</span>
      </div>
      {visibleVehicles.length > 0 ? (
        <div className="garage-home-rail-cards">
          {visibleVehicles.map((vehicle) => (
            <Link key={vehicle.id} href={vehicle.href} className="garage-home-car-card">
              <div className="garage-home-car-image">
                {vehicle.imageUrl ? (
                  <Image src={vehicle.imageUrl} alt="" fill sizes="(max-width: 760px) 74vw, 260px" unoptimized />
                ) : null}
              </div>
              <div>
                <span>{vehicle.eyebrow}</span>
                <strong>{vehicle.label}</strong>
                <p>{vehicle.meta}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Link href="/garage" className="garage-home-empty-card">
          {emptyText}
        </Link>
      )}
    </section>
  );
}

function formatCurrency(value: number | null) {
  if (!value) return "Pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: value >= 10000000 ? "compact" : "standard",
  }).format(value);
}
