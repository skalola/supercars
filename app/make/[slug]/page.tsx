import Link from "next/link";
import { getMakeModelCatalogOptions } from "@/lib/makes/catalog";

type MakePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function MakePage({ params }: MakePageProps) {
  const { slug } = await params;

  const catalog = await getMakeModelCatalogOptions();
  const makeOption = catalog.makes.find((make) => make.slug === slug);
  const make = makeOption
    ? {
        ...makeOption,
        models: catalog.models.filter((model) => model.makeId === makeOption.id),
      }
    : null;

  if (!make) {
    return (
      <main className="garage-page-shell auth-page-shell">
        <section className="auth-panel">
          <div className="garage-page-eyebrow">Explore</div>
          <h1>Make not found</h1>
          <p>This manufacturer is not available in SUPERCAR DASH yet.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="garage-page-shell make-page-shell">
      <section className="garage-page-header">
        <div>
          <div className="garage-page-eyebrow">Explore</div>
          <h1>{make.name}</h1>
          <p>Browse supported models, market intelligence, owner tools, and VIN-backed inventory.</p>
        </div>
        <div className="garage-page-stats make-page-stats">
          <article>
            <span>Models</span>
            <strong>{make.models.length}</strong>
          </article>
        </div>
      </section>

      <section className="make-model-grid">
        {make.models.map((model) => (
          <Link
            key={model.id}
            href={`/make/${make.slug}/${model.slug}`}
            className="make-model-card"
          >
            <span>{make.name}</span>
            <strong>{model.name}</strong>
            <small>{model.slug}</small>
          </Link>
        ))}
      </section>
    </main>
  );
}
