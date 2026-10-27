import Link from "next/link";
import { getCatalogMakeSummaries } from "@/lib/makes/catalog";
import { compareCatalogLabels } from "@/lib/makes/catalog-order";

export const dynamic = "force-dynamic";

export default async function MakesPage() {
  const makes = (await getCatalogMakeSummaries()).sort(compareCatalogLabels);
  const totalModels = makes.reduce((total, make) => total + make.modelCount, 0);

  return (
    <main className="garage-page-shell make-page-shell">
      <section className="garage-page-header">
        <div>
          <div className="garage-page-eyebrow">Explore</div>
          <h1>Makes</h1>
          <p>Choose a manufacturer to browse its complete model catalog, specifications, maintenance guidance, market intelligence, and compatible parts.</p>
        </div>
        <div className="garage-page-stats make-page-stats">
          <article>
            <span>Makes</span>
            <strong>{makes.length}</strong>
          </article>
          <article>
            <span>Models</span>
            <strong>{totalModels}</strong>
          </article>
        </div>
      </section>

      <section className="make-model-grid" aria-label="Vehicle makes">
        {makes.map((make) => (
          <Link key={make.id} href={`/make/${make.slug}`} className="make-model-card">
            <span>Manufacturer</span>
            <strong>{make.name}</strong>
            <small>{make.modelCount.toLocaleString()} {make.modelCount === 1 ? "model" : "models"}</small>
          </Link>
        ))}
      </section>
    </main>
  );
}
