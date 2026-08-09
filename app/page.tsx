import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { ClaimVinButton } from "@/components/garage/ClaimVinButton";
import { getHomepageSummary, type HomepageGarageVehicle } from "@/lib/garage/homepage-summary";

export default async function HomePage() {
  const session = await auth();
  const summary = await getHomepageSummary(session?.user);

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
              <ClaimVinButton isSignedIn={Boolean(session?.user)} />
              <Link href="/meets" className="garage-home-secondary">
                Explore Meets
              </Link>
            </div>
          </div>

          <div className="garage-home-kpis" aria-label="Garage status">
            <KpiCard label={summary.garageValueLabel} value={formatCurrency(summary.garageValue)} detail="Live priced cars" icon="$" />
            <KpiCard label="Total Cars" value={summary.totalCars.toLocaleString()} detail="Collection and market count" icon="#" />
            <KpiCard
              label="Most Expensive"
              value={formatCurrency(summary.mostExpensiveValue)}
              detail={summary.mostExpensiveLabel}
              icon="M"
              href={summary.mostExpensiveHref}
            />
            <KpiCard label="Highest HP" value={summary.fastestCarValue} detail={summary.fastestCarLabel} icon="HP" />
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
            <Link href="/meets">Host event</Link>
          </div>
          <Link href="/meets" className="garage-home-meet-card">
            <strong>Host a SUPERCAR DASH meet</strong>
            <p>Create a local drive, concours stop, or private garage night for nearby owners.</p>
          </Link>
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
  href,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
  href?: string | null;
}) {
  const content = (
    <>
      <span className="garage-home-kpi-icon" aria-hidden="true">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="garage-home-kpi is-link">
        {content}
      </Link>
    );
  }

  return (
    <article className="garage-home-kpi">
      {content}
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
      <GarageRailGroup title="Owned" vehicles={ownedVehicles} emptyText="Claim your first car" emptyHref="/garage" />
      <GarageRailGroup title="View The Market" vehicles={dreamVehicles} emptyText="Browse live inventory" emptyHref="/inventory" wide carousel />
      <GarageRailGroup title="Previously Owned" vehicles={previousVehicles} emptyText="Add cars to dream garage" emptyHref="/inventory" />
    </div>
  );
}

function GarageRailGroup({
  title,
  vehicles,
  emptyText,
  emptyHref,
  wide = false,
  carousel = false,
}: {
  title: string;
  vehicles: HomepageGarageVehicle[];
  emptyText: string;
  emptyHref: string;
  wide?: boolean;
  carousel?: boolean;
}) {
  const visibleVehicles = vehicles.slice(0, carousel ? 10 : wide ? 3 : 1);
  const carouselVehicles = carousel && visibleVehicles.length > 1 ? [...visibleVehicles, ...visibleVehicles] : visibleVehicles;

  return (
    <section className={`garage-home-rail-group${wide ? " wide" : ""}${carousel ? " is-carousel" : ""}`}>
      <div className="garage-home-rail-heading">
        <span>{title}</span>
      </div>
      {visibleVehicles.length > 0 ? (
        <div className="garage-home-rail-cards">
          <div className={`garage-home-rail-track${carousel ? "" : " is-static"}`}>
            {carouselVehicles.map((vehicle, index) => (
              <Link key={`${vehicle.id}:${index}`} href={vehicle.href} className="garage-home-car-card">
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
        </div>
      ) : (
        <Link href={emptyHref} className="garage-home-empty-card">
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
