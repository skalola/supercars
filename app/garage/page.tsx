import Link from "next/link";
import Image from "next/image";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

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

  const garageItems = await prisma.garageItem.findMany({
    where: { userId: session.user.id as string },
    include: {
      model: {
        include: {
          make: true,
          images: {
            orderBy: [{ type: "asc" }, { createdAt: "asc" }],
            take: 1,
          },
          vehicles: {
            where: { ownerId: session.user.id as string },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="page-shell" style={{ maxWidth: 900 }}>
      <section className="page-header">
        <div>
          <div className="eyebrow">Garage</div>
          <h1 className="page-title compact">My Garage</h1>
        </div>
      </section>
      {garageItems.length === 0 ? (
        <section className="surface-panel">
          <p style={{ color: "var(--muted)", margin: 0 }}>Your saved models will appear here.</p>
        </section>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {garageItems.map((item) => {
            const heroImage = item.model.images[0]?.url ?? null;
            const vehicle = item.model.vehicles[0] ?? null;
            return (
              <Link key={item.id} href={`/make/${item.model.make.slug}/${item.model.slug}`} className="surface-card clean-link" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ position: "relative", width: 140, height: 90, borderRadius: 10, overflow: "hidden", background: "#f8fafc" }}>
                  {heroImage ? (
                    <Image src={heroImage} alt={`${item.model.make.name} ${item.model.name}`} fill sizes="140px" style={{ objectFit: "cover" }} unoptimized />
                  ) : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 20 }}>{item.model.name}</div>
                    {vehicle && (
                      <span style={{ 
                        fontSize: 10, 
                        fontWeight: 800, 
                        padding: "2px 6px", 
                        borderRadius: 4, 
                        background: vehicle.status === "CLAIMED" ? "#dcfce7" : "#fef3c7", 
                        color: vehicle.status === "CLAIMED" ? "#166534" : "#92400e",
                        border: `1px solid ${vehicle.status === "CLAIMED" ? "#bbf7d0" : "#fde68a"}`
                      }}>
                        {vehicle.status === "CLAIMED" ? "CLAIMED" : "CLAIM PENDING"}
                      </span>
                    )}
                  </div>
                  <div style={{ color: "#666", marginTop: 4 }}>{item.model.make.name}</div>
                  <div style={{ color: "#666", marginTop: 4 }}>{item.model.years ?? "Production years unavailable"}</div>
                </div>
              </Link>
            );


          })}
        </div>
      )}
    </main>
  );
}
