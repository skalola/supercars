import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import GarageTabs, { type GarageClaimedVehicle, type GaragePreviousVehicle, type GarageSavedVehicle } from "./GarageTabs";
import { getGarageClubSummary } from "./garage-clubs";
import { getGarageMeetSummary } from "./garage-meets";
import { getGarageStats } from "./garage-stats";
import GarageSupportRail, { type GarageRecentActivityItem, type GarageServiceWatchItem } from "./GarageSupportRail";
import { getNextMaintenanceRecommendation } from "@/lib/maintenance/recommendations";

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
            <form action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/garage" });
            }}>
              <button type="submit" className="garage-primary-button">Login with Google</button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
  });

  if (!user?.username) {
    redirect("/onboarding");
  }

  const [claimedVehicleRows, previousVehicleRows, garageItems, meetSummary, clubSummary] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        ownerId: session.user.id as string,
        status: "CLAIMED",
      },
      include: {
        model: {
          include: {
            make: true,
            maintenanceRules: true,
            spec: true,
            images: {
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              take: 1,
            },
          },
        },
        photos: {
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          take: 1,
        },
        images: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
        modifications: true,
        serviceRecords: true,
        listings: {
          where: {
            status: "ACTIVE",
            OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
          },
          select: { askingPrice: true, price: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.vehicle.findMany({
      where: {
        ownerId: session.user.id as string,
        status: { not: "CLAIMED" },
      },
      include: {
        model: {
          include: {
            make: true,
            images: {
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              take: 1,
            },
          },
        },
        photos: {
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          take: 1,
        },
        images: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
        listings: {
          where: {
            OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
          },
          select: { askingPrice: true, price: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.garageItem.findMany({
      where: { userId: session.user.id as string },
      include: {
        model: {
          include: {
            make: true,
            images: {
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getGarageMeetSummary(session.user.id as string),
    getGarageClubSummary(session.user.id as string, true),
  ]);

  const claimedModelIds = new Set(claimedVehicleRows.map((vehicle) => vehicle.modelId));
  const claimedVehicles: GarageClaimedVehicle[] = claimedVehicleRows.map((vehicle) => ({
    id: vehicle.id,
    vin: vehicle.vin,
    year: vehicle.year,
    status: vehicle.status,
    mileage: vehicle.mileage,
    image: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || null,
    makeLogoUrl: vehicle.model.make.logoUrl,
    makeName: vehicle.model.make.name,
    makeSlug: vehicle.model.make.slug,
    modelName: vehicle.model.name,
    modelSlug: vehicle.model.slug,
    trim: vehicle.trim,
    estimatedValue: vehicle.listings[0]?.askingPrice ?? vehicle.listings[0]?.price ?? null,
  }));

  const savedVehicles: GarageSavedVehicle[] = garageItems
    .filter((item) => !claimedModelIds.has(item.modelId))
    .map((item) => ({
      id: item.id,
      image: item.model.images[0]?.url || null,
      makeLogoUrl: item.model.make.logoUrl,
      makeName: item.model.make.name,
      makeSlug: item.model.make.slug,
      modelName: item.model.name,
      modelSlug: item.model.slug,
      years: item.model.years,
      priceTrackerAlertsEnabled: item.priceTrackerAlertsEnabled,
      listingTrackerAlertsEnabled: item.listingTrackerAlertsEnabled,
    }));
  const previousVehicles: GaragePreviousVehicle[] = previousVehicleRows.map((vehicle) => ({
    id: vehicle.id,
    vin: vehicle.vin,
    year: vehicle.year,
    status: vehicle.status,
    mileage: vehicle.mileage,
    image: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || null,
    makeLogoUrl: vehicle.model.make.logoUrl,
    makeName: vehicle.model.make.name,
    makeSlug: vehicle.model.make.slug,
    modelName: vehicle.model.name,
    modelSlug: vehicle.model.slug,
    trim: vehicle.trim,
    estimatedValue: vehicle.listings[0]?.askingPrice ?? vehicle.listings[0]?.price ?? null,
  }));
  const totalVehicles = claimedVehicles.length + savedVehicles.length;
  const garageStats = getGarageStats(claimedVehicleRows, totalVehicles);
  const serviceWatch = getGarageServiceWatch(claimedVehicleRows);
  const recentActivity = getRecentGarageActivity(claimedVehicleRows, garageItems, meetSummary);
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
            clubs={clubSummary}
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

type GarageVehicleRow = {
  id: string;
  vin: string;
  year: number;
  mileage: number | null;
  createdAt: Date;
  model: {
    name: string;
    make: { name: string; logoUrl: string | null };
    maintenanceRules: Parameters<typeof getNextMaintenanceRecommendation>[0]["rules"];
  };
  serviceRecords: Parameters<typeof getNextMaintenanceRecommendation>[0]["serviceRecords"];
};

type GarageItemRow = {
  id: string;
  createdAt: Date;
  model: { slug: string; make: { name: string; slug: string }; name: string };
};

function getGarageServiceWatch(vehicles: GarageVehicleRow[]): GarageServiceWatchItem[] {
  return vehicles
    .map((vehicle) => {
      const recommendation = getNextMaintenanceRecommendation({
        currentMileage: vehicle.mileage,
        rules: vehicle.model.maintenanceRules,
        serviceRecords: vehicle.serviceRecords,
      });

      if (!recommendation) return null;

      return {
        id: vehicle.id,
        href: `/vehicle/${vehicle.vin}#vehicle-maintenance`,
        logoUrl: vehicle.model.make.logoUrl,
        vehicleLabel: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
        serviceName: recommendation.serviceName,
        dueText: formatServiceDueText(recommendation.remainingMiles, recommendation.dueText),
        status: recommendation.status,
      };
    })
    .filter((item): item is GarageServiceWatchItem => Boolean(item))
    .sort((a, b) => serviceStatusRank(a.status) - serviceStatusRank(b.status)) as GarageServiceWatchItem[];
}

function getRecentGarageActivity(
  vehicles: GarageVehicleRow[],
  garageItems: GarageItemRow[],
  meetSummary: Awaited<ReturnType<typeof getGarageMeetSummary>>,
): GarageRecentActivityItem[] {
  const vehicleActivity = vehicles.map((vehicle) => ({
    id: `claimed:${vehicle.id}`,
    href: `/vehicle/${vehicle.vin}`,
    tone: "add" as const,
    title: `Added a car`,
    subtitle: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
    timestamp: formatRelativeDate(vehicle.createdAt),
    sortDate: vehicle.createdAt,
  }));
  const dreamActivity = garageItems.map((item) => ({
    id: `dream:${item.id}`,
    href: `/make/${item.model.make.slug}/${item.model.slug}`,
    tone: "market" as const,
    title: `Saved to dream garage`,
    subtitle: `${item.model.make.name} ${item.model.name}`,
    timestamp: formatRelativeDate(item.createdAt),
    sortDate: item.createdAt,
  }));
  const meetActivity = [...meetSummary.upcoming, ...meetSummary.hosted, ...meetSummary.attended].slice(0, 4).map((meet, index) => ({
    id: `meet:${meet.id}:${index}`,
    href: meet.href,
    tone: "meet" as const,
    title: meet.badge,
    subtitle: meet.title,
    timestamp: meet.date,
    sortDate: new Date(0),
  }));

  return [...vehicleActivity, ...dreamActivity, ...meetActivity]
    .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      href: item.href,
      tone: item.tone,
      title: item.title,
      subtitle: item.subtitle,
      timestamp: item.timestamp,
    }));
}

function formatServiceDueText(remainingMiles: number | null, dueText: string) {
  if (remainingMiles === null) return dueText;
  if (remainingMiles <= 0) return "Due now";
  return `Due in ${remainingMiles.toLocaleString()} mi`;
}

function serviceStatusRank(status: GarageServiceWatchItem["status"]) {
  if (status === "DUE") return 0;
  if (status === "DUE_SOON") return 1;
  return 2;
}

function formatRelativeDate(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / 3_600_000));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
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
