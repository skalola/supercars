import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function UserGaragePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
        <h1>Garage not found</h1>
        <p>The requested garage does not exist.</p>
        <Link href="/" style={{ color: "#2563eb" }}>Return home</Link>
      </main>
    );
  }

  // Only allow the owner to view the garage for now
  if (!session?.user || session.user.id !== user.id) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
        <h1>Private Garage</h1>
        <p>This garage is private.</p>
        <Link href="/" style={{ color: "#2563eb" }}>Return home</Link>
      </main>
    );
  }

  const garageItems = await prisma.garageItem.findMany({
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
  });

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 32, marginBottom: 24 }}>{user.username}'s Garage</h1>
      {garageItems.length === 0 ? (
        <p style={{ color: "#666" }}>Your saved models will appear here.</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {garageItems.map((item) => {
            const heroImage = item.model.images[0]?.url ?? null;
            return (
              <Link key={item.id} href={`/make/${item.model.make.slug}/${item.model.slug}`} style={{ display: "flex", gap: 16, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, textDecoration: "none", color: "inherit" }}>
                <div style={{ position: "relative", width: 140, height: 90, borderRadius: 10, overflow: "hidden", background: "#f8fafc" }}>
                  {heroImage ? (
                    <Image src={heroImage} alt={`${item.model.make.name} ${item.model.name}`} fill sizes="140px" style={{ objectFit: "cover" }} unoptimized />
                  ) : null}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 20 }}>{item.model.name}</div>
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
