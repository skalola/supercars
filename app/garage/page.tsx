import Link from "next/link";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import GarageTabs, { type GarageClaimedVehicle, type GarageSavedVehicle } from "./GarageTabs";

export default async function GaragePage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="page-shell" style={{ maxWidth: 900 }}>
        <section className="surface-panel">
          <div className="eyebrow">Garage</div>
          <h1 className="page-title compact">My Garage</h1>
          <p className="page-copy">Sign in to create your collection.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <form action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/garage" });
            }}>
              <button type="submit" className="site-button secondary">Login with Google</button>
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

  return (
    <main className="page-shell" style={{ maxWidth: 1120 }}>
      <section className="page-header">
        <div>
          <div className="eyebrow">Garage</div>
          <h1 className="page-title compact">My Garage</h1>
        </div>
      </section>
      {claimedVehicles.length === 0 && savedVehicles.length === 0 ? (
        <section className="surface-panel">
          <p style={{ color: "var(--muted)", margin: 0 }}>Your saved models will appear here.</p>
        </section>
      ) : (
        <GarageTabs claimedVehicles={claimedVehicles} savedVehicles={savedVehicles} />
      )}
    </main>
  );
}
