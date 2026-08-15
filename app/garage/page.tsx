import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import GarageTabs from "./GarageTabs";
import GarageSupportRail from "./GarageSupportRail";
import GarageClubBadges from "./GarageClubBadges";
import { getGarageDashboardData } from "./garage-data";

export default async function GaragePage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="garage-page-shell">
        <section className="garage-empty-hero">
          <div className="garage-page-eyebrow">Garage</div>
          <h1>Build Your Digital Garage</h1>
          <p>Sign in to claim VIN-backed vehicles, save dream models, and track ownership from one collection view.</p>
          <div className="garage-empty-actions">
            <Link href="/login?returnTo=/garage" className="garage-primary-button">Sign up / Login</Link>
          </div>
        </section>
      </main>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      image: true,
      emailVerified: true,
    },
  });

  if (!user?.username) {
    redirect("/onboarding");
  }

  const {
    claimedVehicles,
    savedVehicles,
    previousVehicles,
    garageStats,
    serviceWatch,
    recentActivity,
    clubSummary,
  } = await getGarageDashboardData(session.user.id as string, true);
  const displayName = user.name || user.username;
  const garageHandle = user.username ? `@${user.username}` : user.email || "SUPERCAR DASH member";
  const garageLocation = getGarageLocation(clubSummary);
  const heroClaimedVehicle = claimedVehicles[0] || null;
  const heroSavedVehicle = savedVehicles[0] || null;
  const isVerifiedGarage = Boolean(user.emailVerified || claimedVehicles.length > 0);
  const heroVehicleLabel = heroClaimedVehicle
    ? `${heroClaimedVehicle.year} ${heroClaimedVehicle.makeName} ${heroClaimedVehicle.modelName}`
    : heroSavedVehicle
      ? `${heroSavedVehicle.makeName} ${heroSavedVehicle.modelName}`
      : "Build your collection";
  const heroImage = heroClaimedVehicle?.image || heroSavedVehicle?.image || "/images/garage-home-hero.png?v=garage-2";
  const heroStyle = {
    "--garage-profile-hero-image": `url("${heroImage}")`,
  } as CSSProperties;

  return (
    <main className="garage-page-shell garage-profile-page">
      <section className="garage-profile-hero" style={heroStyle}>
        <div className="garage-profile-hero-shade" aria-hidden="true" />
        <div className="garage-profile-identity">
          <div className="garage-profile-avatar">
            {user.image ? <Image src={user.image} alt="" width={96} height={96} unoptimized /> : <span>{displayName?.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div>
            <div className="garage-page-eyebrow">Garage</div>
            <h1>
              <span>{displayName}&apos;s Garage</span>
              {isVerifiedGarage ? <span className="garage-verified-badge" aria-label="Verified garage" /> : null}
            </h1>
            <div className="garage-profile-meta">
              <span>{garageHandle}</span>
              {garageLocation ? <span className="garage-location-chip"><span aria-hidden="true" />{garageLocation}</span> : null}
              <span>{heroVehicleLabel}</span>
            </div>
          </div>
          <GarageClubBadges clubs={clubSummary} />
        </div>

        <div className="garage-page-stats garage-profile-stats" aria-label="Garage summary">
          <GarageStatCell href="/inventory" label="Total Collection Value" value={garageStats.totalCollectionValue} detail="vs last 30 days" />
          <GarageStatCell href="#garage-collection" label="Cars Owned" value={garageStats.totalCars.toLocaleString()} detail="View all cars" />
          <GarageStatCell href={garageStats.mostValuableHref} label="Most Valuable" value={garageStats.mostValuable} detail={garageStats.mostValuableLabel} />
          <GarageStatCell href={garageStats.fastestCarHref} label="Fastest Car (HP)" value={garageStats.fastestCar} detail={garageStats.fastestCarPower} />
        </div>

        <div className="garage-profile-actions">
          <Link href="/makes" className="garage-header-add-button">
            <span className="garage-button-plus" aria-hidden="true" />
            Add Car
          </Link>
          <Link href="/inventory" className="garage-profile-secondary-button">View Market</Link>
        </div>
      </section>
      <section id="garage-collection" className="garage-dashboard-layout" aria-label="Garage dashboard">
        <GarageTabs claimedVehicles={claimedVehicles} savedVehicles={savedVehicles} previousVehicles={previousVehicles} isOwner />
        <aside className="garage-support-grid" aria-label="Garage social summary">
          <GarageSupportRail
            serviceWatch={serviceWatch}
            recentActivity={recentActivity}
            isOwner
            garageHref={`/garage/${user.username}`}
            trackerHref={`/garage/${user.username}/trackers`}
          />
        </aside>
      </section>
    </main>
  );
}

function getGarageLocation(clubs: { location: string }[]) {
  const location = clubs.find((club) => club.location && club.location !== "Location pending")?.location;
  return location || null;
}

function GarageStatCell({ href, label, value, detail }: { href: string | null; label: string; value: string; detail: string }) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </>
  );

  return href ? (
    <Link href={href} className="garage-stat-link">
      {content}
    </Link>
  ) : (
    <article>{content}</article>
  );
}
