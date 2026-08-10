import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import GarageTabs, { type GarageClaimedVehicle, type GarageSavedVehicle } from "../GarageTabs";
import { getGarageClubSummary } from "../garage-clubs";
import { getGarageMeetSummary } from "../garage-meets";
import { getGarageStats } from "../garage-stats";
import GarageClubHistory from "../GarageClubHistory";
import GarageMeetHistory from "../GarageMeetHistory";

export default async function UserGaragePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { username },
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

  const [claimedVehicleRows, garageItems, meetSummary, clubSummary] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        ownerId: user.id,
        status: "CLAIMED",
      },
      include: {
        model: {
          include: {
            make: true,
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
    prisma.garageItem.findMany({
      where: { userId: user.id },
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
    getGarageMeetSummary(user.id),
    getGarageClubSummary(user.id, isOwner),
  ]);

  const claimedModelIds = new Set(claimedVehicleRows.map((vehicle) => vehicle.modelId));
  const claimedVehicles: GarageClaimedVehicle[] = claimedVehicleRows.map((vehicle) => ({
    id: vehicle.id,
    vin: vehicle.vin,
    year: vehicle.year,
    status: vehicle.status,
    mileage: vehicle.mileage,
    image: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || null,
    makeName: vehicle.model.make.name,
    makeSlug: vehicle.model.make.slug,
    modelName: vehicle.model.name,
    modelSlug: vehicle.model.slug,
    trim: vehicle.trim,
  }));

  const savedVehicles: GarageSavedVehicle[] = garageItems
    .filter((item) => !claimedModelIds.has(item.modelId))
    .map((item) => ({
      id: item.id,
      image: item.model.images[0]?.url || null,
      makeName: item.model.make.name,
      makeSlug: item.model.make.slug,
      modelName: item.model.name,
      modelSlug: item.model.slug,
      years: item.model.years,
      priceTrackerAlertsEnabled: item.priceTrackerAlertsEnabled,
      listingTrackerAlertsEnabled: item.listingTrackerAlertsEnabled,
    }));
  const totalVehicles = claimedVehicles.length + savedVehicles.length;
  const garageStats = getGarageStats(claimedVehicleRows, totalVehicles);

  return (
    <main className="garage-page-shell">
      <section className="garage-page-header">
        <div>
          <div className="garage-page-eyebrow">Profile Garage</div>
          <h1>{user.username}&apos;s Garage</h1>
          <p>Claimed vehicles and saved models are organized as one persistent collection.</p>
        </div>
        <div className="garage-page-stats" aria-label="Garage summary">
          <article>
            <span>Total Cars</span>
            <strong>{garageStats.totalCars}</strong>
          </article>
          <article>
            <span>Total Spent</span>
            <strong>{garageStats.totalSpent}</strong>
            <small>Estimated from active listings</small>
          </article>
          <article>
            <span>Fastest Car</span>
            <strong>{garageStats.fastestCar}</strong>
            <small>{garageStats.fastestCarLabel}</small>
          </article>
          <article>
            <span>Spent on Mods</span>
            <strong>{garageStats.modSpend}</strong>
            <small>{garageStats.modDetail}</small>
          </article>
        </div>
      </section>
      {totalVehicles === 0 ? (
        <section className="garage-empty-panel">
          <h2>No vehicles yet</h2>
          <p>This public garage has not added claimed vehicles or saved models yet.</p>
          <Link href="/inventory">Browse Market</Link>
        </section>
      ) : (
        <GarageTabs claimedVehicles={claimedVehicles} savedVehicles={savedVehicles} isOwner={isOwner} />
      )}
      <GarageClubHistory clubs={clubSummary} isOwner={isOwner} />
      <GarageMeetHistory meetSummary={meetSummary} isOwner={isOwner} />
    </main>
  );
}
