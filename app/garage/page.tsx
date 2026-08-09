import Link from "next/link";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import GarageTabs, { type GarageClaimedVehicle, type GarageSavedVehicle } from "./GarageTabs";

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

  const [claimedVehicleRows, garageItems] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        ownerId: session.user.id as string,
        status: "CLAIMED",
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
      },
      orderBy: { createdAt: "desc" },
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

  return (
    <main className="garage-page-shell">
      <section className="garage-page-header">
        <div>
          <div className="garage-page-eyebrow">Garage</div>
          <h1>My Digital Garage</h1>
          <p>Claimed vehicles, saved models, tracker settings, and ownership history live here.</p>
        </div>
        <div className="garage-page-stats" aria-label="Garage summary">
          <article>
            <span>Claimed</span>
            <strong>{claimedVehicles.length}</strong>
          </article>
          <article>
            <span>Saved</span>
            <strong>{savedVehicles.length}</strong>
          </article>
          <article>
            <span>Total</span>
            <strong>{totalVehicles}</strong>
          </article>
        </div>
      </section>
      {totalVehicles === 0 ? (
        <section className="garage-empty-panel">
          <h2>No vehicles yet</h2>
          <p>Your claimed vehicles and saved models will appear here.</p>
          <Link href="/inventory">Browse Market</Link>
        </section>
      ) : (
        <GarageTabs claimedVehicles={claimedVehicles} savedVehicles={savedVehicles} isOwner />
      )}
    </main>
  );
}
