import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import GarageTabs from "../GarageTabs";
import GarageSupportRail from "../GarageSupportRail";
import { getGarageDashboardData } from "../garage-data";

export default async function UserGaragePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      name: true,
      image: true,
      emailVerified: true,
    },
  });

  if (!user) {
    return (
      <main className="garage-page-shell">
        <section className="garage-empty-panel">
          <div className="garage-page-eyebrow">Garage</div>
          <h2>Garage not found</h2>
          <p>The requested garage does not exist.</p>
          <Link href="/">Return home</Link>
        </section>
      </main>
    );
  }

  const isOwner = session?.user?.id === user.id;

  const {
    claimedVehicles,
    savedVehicles,
    previousVehicles,
    garageStats,
    serviceWatch,
    recentActivity,
    clubSummary,
  } = await getGarageDashboardData(user.id, isOwner);
  const displayName = user.name || user.username;
  const garageHandle = user.username ? `@${user.username}` : "SUPERCAR DASH member";
  const garageLocation = getGarageLocation(clubSummary);
  const heroClaimedVehicle = claimedVehicles[0] || null;
  const heroSavedVehicle = savedVehicles[0] || null;
  const isVerifiedGarage = Boolean(user.emailVerified || claimedVehicles.length > 0);
  const heroVehicleLabel = heroClaimedVehicle
    ? `${heroClaimedVehicle.year} ${heroClaimedVehicle.makeName} ${heroClaimedVehicle.modelName}`
    : heroSavedVehicle
      ? `${heroSavedVehicle.makeName} ${heroSavedVehicle.modelName}`
      : "Public garage";
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
            <div className="garage-page-eyebrow">{isOwner ? "Garage" : "Profile Garage"}</div>
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
          <div className="garage-profile-clubs" aria-label="Car club badges">
            <span>Car Clubs</span>
            <div>
              {clubSummary.slice(0, 5).map((club) => (
                <Link key={club.id} href={club.href} title={club.name} aria-label={club.name}>
                  {club.logoUrl ? <Image src={club.logoUrl} alt="" width={40} height={40} unoptimized /> : <span>{club.name.slice(0, 2).toUpperCase()}</span>}
                </Link>
              ))}
              {clubSummary.length === 0 ? <small>No club badges yet</small> : null}
            </div>
          </div>
        </div>

        <div className="garage-page-stats garage-profile-stats" aria-label="Garage summary">
          <GarageStatCell href="/inventory" label="Total Collection Value" value={garageStats.totalCollectionValue} detail="vs last 30 days" />
          <GarageStatCell href="#garage-collection" label="Cars Owned" value={garageStats.totalCars.toLocaleString()} detail="View all cars" />
          <GarageStatCell href={garageStats.mostValuableHref} label="Most Valuable" value={garageStats.mostValuable} detail={garageStats.mostValuableLabel} />
          <GarageStatCell href={garageStats.fastestCarHref} label="Fastest Car (HP)" value={garageStats.fastestCar} detail={garageStats.fastestCarPower} />
        </div>

        <div className={isOwner ? "garage-profile-actions" : "garage-profile-actions is-public"}>
          {isOwner ? (
            <Link href="/makes" className="garage-header-add-button">
              <span className="garage-button-plus" aria-hidden="true" />
              Add Car
            </Link>
          ) : null}
          <Link href="/inventory" className="garage-profile-secondary-button">View Market</Link>
        </div>
      </section>
      <section id="garage-collection" className="garage-dashboard-layout" aria-label="Garage dashboard">
        <GarageTabs claimedVehicles={claimedVehicles} savedVehicles={savedVehicles} previousVehicles={previousVehicles} isOwner={isOwner} />
        <aside className="garage-support-grid" aria-label="Garage social summary">
          <GarageSupportRail
            clubs={clubSummary}
            serviceWatch={serviceWatch}
            recentActivity={recentActivity}
            isOwner={isOwner}
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
