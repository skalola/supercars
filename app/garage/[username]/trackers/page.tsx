import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getNextMaintenanceRecommendation } from "@/lib/maintenance/recommendations";
import {
  getClaimedVehicleServiceRecordSummaries,
  groupServiceRecordsByVehicle,
} from "@/lib/maintenance/service-record-summaries";
import TrackersClient, { type TrackerCard } from "./TrackersClient";

const trackerUserSelect = {
  id: true,
  trackerPreference: {
    select: {
      listingTrackerEnabled: true,
      priceTrackerEnabled: true,
      maintenanceTrackerEnabled: true,
      eventsTrackerEnabled: true,
    },
  },
  garageItems: {
    select: {
      id: true,
      model: {
        select: {
          name: true,
          make: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  },
  vehicles: {
    where: { status: "CLAIMED" },
    select: {
      id: true,
      year: true,
      mileage: true,
      profile: {
        select: {
          currentMileage: true,
        },
      },
      model: {
        select: {
          name: true,
          make: { select: { name: true } },
          maintenanceRules: {
            select: {
              id: true,
              serviceName: true,
              description: true,
              intervalMiles: true,
              intervalMonths: true,
              priority: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  },
} satisfies Prisma.UserSelect;

export default async function ProfileTrackersPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    const profileExists = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return (
      <main className="garage-page-shell">
        <section className="garage-empty-panel">
          <h1>{profileExists ? "Private Trackers" : "Profile not found"}</h1>
          <p>{profileExists ? "Only the profile owner can manage tracker settings." : "This profile does not exist."}</p>
          <Link href="/">
            Return home
          </Link>
        </section>
      </main>
    );
  }

  const user = await prisma.user.findFirst({
    where: { username, id: session.user.id },
    select: trackerUserSelect,
  });

  if (!user) {
    const profileExists = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return (
      <main className="garage-page-shell">
        <section className="garage-empty-panel">
          <h1>{profileExists ? "Private Trackers" : "Profile not found"}</h1>
          <p>{profileExists ? "Only the profile owner can manage tracker settings." : "This profile does not exist."}</p>
          <Link href="/">
            Return home
          </Link>
        </section>
      </main>
    );
  }

  const serviceRecordsByVehicle = groupServiceRecordsByVehicle(
    await getClaimedVehicleServiceRecordSummaries(user.id),
  );

  const savedModelNames = user.garageItems
    .slice(0, 3)
    .map((item) => `${item.model.make.name} ${item.model.name}`);
  const maintenanceRecommendations = user.vehicles
    .map((vehicle) => {
      const currentMileage = vehicle.mileage ?? vehicle.profile?.currentMileage ?? null;
      const recommendation = getNextMaintenanceRecommendation({
        currentMileage,
        rules: vehicle.model.maintenanceRules,
        serviceRecords: serviceRecordsByVehicle.get(vehicle.id) ?? [],
      });
      return recommendation
        ? `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}: ${recommendation.serviceName} (${recommendation.dueText})`
        : null;
    })
    .filter(Boolean) as string[];

  const preference = user.trackerPreference;
  const trackers: TrackerCard[] = [
    {
      id: "listing",
      label: "Listings",
      enabled: preference?.listingTrackerEnabled ?? false,
      description: "Email me when a new inventory listing matches one of my saved models.",
      signal:
        savedModelNames.length > 0
          ? savedModelNames.join(", ")
          : "Save supported supercar models to activate listing matching.",
      countLabel: `${user.garageItems.length} saved model${user.garageItems.length === 1 ? "" : "s"}`,
    },
    {
      id: "price",
      label: "Price",
      enabled: preference?.priceTrackerEnabled ?? false,
      description: "Email me when pricing drops below the tracked baseline for my saved models.",
      signal:
        savedModelNames.length > 0
          ? savedModelNames.join(", ")
          : "Save models to create price baselines.",
      countLabel: `${user.garageItems.length} price watch${user.garageItems.length === 1 ? "" : "es"}`,
    },
    {
      id: "maintenance",
      label: "Maintenance",
      enabled: preference?.maintenanceTrackerEnabled ?? false,
      description: "Email me when my claimed vehicles are due or coming due for Vehicle Passport service.",
      signal:
        maintenanceRecommendations.length > 0
          ? maintenanceRecommendations.slice(0, 3).join("; ")
          : "Claim a vehicle and add current mileage to calculate recommended service.",
      countLabel: `${user.vehicles.length} claimed vehicle${user.vehicles.length === 1 ? "" : "s"}`,
    },
    {
      id: "events",
      label: "Events",
      enabled: preference?.eventsTrackerEnabled ?? false,
      description: "Email me about relevant SUPERCAR DASH events and ownership opportunities.",
      signal: "Account-level preference reserved for event campaigns.",
      countLabel: "Profile updates",
    },
  ];

  return (
    <main className="garage-page-shell">
      <section className="garage-page-header">
        <div>
          <div className="garage-page-eyebrow">Profile automation</div>
          <h1>Trackers</h1>
          <p>
            Manage the email signals tied to your saved models and claimed VIN-backed vehicles.
          </p>
        </div>
        <div className="tracker-header-panel">
          <div className="garage-page-stats tracker-page-stats" aria-label="Tracker coverage">
            <article>
              <span>Saved models</span>
              <strong>{user.garageItems.length}</strong>
            </article>
            <article>
              <span>Claimed cars</span>
              <strong>{user.vehicles.length}</strong>
            </article>
            <article>
              <span>Signals</span>
              <strong>{trackers.filter((tracker) => tracker.enabled).length}</strong>
            </article>
          </div>
          <Link href={`/garage/${username}`} className="garage-secondary-button">
            Back to Profile
          </Link>
        </div>
      </section>

      <TrackersClient trackers={trackers} />
    </main>
  );
}
