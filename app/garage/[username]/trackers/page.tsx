import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getNextMaintenanceRecommendation } from "@/lib/maintenance/recommendations";
import TrackersClient, { type TrackerCard } from "./TrackersClient";

export default async function ProfileTrackersPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      trackerPreference: true,
      garageItems: {
        include: {
          model: {
            include: {
              make: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      vehicles: {
        where: { status: "CLAIMED" },
        include: {
          profile: true,
          serviceRecords: true,
          model: {
            include: {
              make: true,
              maintenanceRules: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    return (
      <main className="garage-page-shell">
        <section className="garage-empty-panel">
          <h1>Profile not found</h1>
          <p>This profile does not exist.</p>
          <Link href="/">
            Return home
          </Link>
        </section>
      </main>
    );
  }

  if (!session?.user || session.user.id !== user.id) {
    return (
      <main className="garage-page-shell">
        <section className="garage-empty-panel">
          <h1>Private Trackers</h1>
          <p>Only the profile owner can manage tracker settings.</p>
          <Link href="/">
            Return home
          </Link>
        </section>
      </main>
    );
  }

  const savedModelNames = user.garageItems
    .slice(0, 3)
    .map((item) => `${item.model.make.name} ${item.model.name}`);
  const maintenanceRecommendations = user.vehicles
    .map((vehicle) => {
      const currentMileage = (vehicle as { currentMileage?: number | null }).currentMileage ?? vehicle.mileage ?? vehicle.profile?.currentMileage ?? null;
      const recommendation = getNextMaintenanceRecommendation({
        currentMileage,
        rules: vehicle.model.maintenanceRules,
        serviceRecords: vehicle.serviceRecords,
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
