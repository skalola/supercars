import Link from "next/link";
import type { Metadata } from "next";
import { getCatalogMakeWithModels } from "@/lib/makes/catalog";
import { buildPublicMetadata, humanizeSlug } from "@/lib/seo";

type MakePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: MakePageProps): Promise<Metadata> {
  const { slug } = await params;
  const make = await getCatalogMakeWithModels(slug);
  const name = make?.name || humanizeSlug(slug);

  return buildPublicMetadata({
    title: `${name} Models, Market Data and Ownership`,
    description: `Explore ${name} models with specifications, ownership tools, market intelligence, live listings, maintenance guidance, and compatible parts.`,
    path: `/make/${slug}`,
    image: make?.logoUrl,
    keywords: [`${name} models`, `${name} market value`, `${name} maintenance`, `${name} parts`],
  });
}

export default async function MakePage({ params }: MakePageProps) {
  const { slug } = await params;

  const make = await getCatalogMakeWithModels(slug);

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
