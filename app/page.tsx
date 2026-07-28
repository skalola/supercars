import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const makes = await prisma.make.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <main className="page-shell">
      <section className="page-header">
        <div>
          <div className="eyebrow">SUPERCAR DASH</div>
          <h1 className="page-title">Supercar Dash</h1>
          <p className="page-copy">
            VIN-backed Ferrari and Lamborghini inventory, ownership records, and fulfillment requests in one clean workspace.
          </p>
        </div>
        <Link href="/inventory" className="site-button">
          Browse inventory
        </Link>
      </section>

      <section className="card-grid" aria-label="Manufacturers">
        {makes.map((make) => (
          <Link
            key={make.id}
            href={`/make/${make.slug}`}
            className="surface-card clean-link"
          >
            <div className="eyebrow">Manufacturer</div>
            <h2 style={{ margin: "10px 0 6px", fontSize: 24, lineHeight: 1.1 }}>{make.name}</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>View models and inventory</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
