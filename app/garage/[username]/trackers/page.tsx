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
      <main className="page-shell" style={{ maxWidth: 900 }}>
        <section className="surface-panel">
          <h1 className="page-title compact">Profile not found</h1>
          <p style={{ color: "var(--muted)" }}>This profile does not exist.</p>
          <Link href="/" className="button-primary">
            Return home
          </Link>
        </section>
      </main>
    );
  }

  if (!session?.user || session.user.id !== user.id) {
    return (
      <main className="page-shell" style={{ maxWidth: 900 }}>
        <section className="surface-panel">
          <h1 className="page-title compact">Private Trackers</h1>
          <p style={{ color: "var(--muted)" }}>Only the profile owner can manage tracker settings.</p>
          <Link href="/" className="button-primary">
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
          : "Save Ferrari or Lamborghini models to activate listing matching.",
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
    <main className="page-shell" style={{ maxWidth: 1120 }}>
      <section className="page-header">
        <div>
          <div className="eyebrow">Profile</div>
          <h1 className="page-title compact">Trackers</h1>
          <p style={{ maxWidth: 700, color: "var(--muted)", margin: "10px 0 0", lineHeight: 1.55 }}>
            Manage the email signals tied to your saved models and claimed VIN-backed vehicles.
          </p>
        </div>
        <Link href={`/garage/${username}`} className="button-secondary">
          Back to Profile
        </Link>
      </section>

      <TrackersClient trackers={trackers} />
    </main>
  );
}
