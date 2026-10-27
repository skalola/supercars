/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getMakerSiteCatalog } from "@/lib/maker-sites/catalog";
import { getMakerSiteConfig } from "@/lib/maker-sites/config";

type MakerSitePageProps = { params: Promise<{ makeSlug: string }> };

export async function generateMetadata({ params }: MakerSitePageProps): Promise<Metadata> {
  const { makeSlug } = await params;
  const config = getMakerSiteConfig(makeSlug);
  if (!config) return {};
  return {
    title: `${config.displayName} Models Past and Present`,
    description: `Explore ${config.displayName} vehicles, specifications, ownership guidance, maintenance intelligence, market values, and compatible parts.`,
    alternates: { canonical: `https://${config.hostname}` },
  };
}

export default async function MakerSitePage({ params }: MakerSitePageProps) {
  const { makeSlug } = await params;
  const config = getMakerSiteConfig(makeSlug);
  if (!config?.enabled) notFound();

  const make = await getMakerSiteCatalog(makeSlug);
  if (!make) notFound();

  const flagship = make.models.find((model) => model.slug === config.flagshipModelSlug) ?? make.models[0];
  const currentYear = new Date().getFullYear();
  const currentModels = make.models.filter((model) =>
    Boolean(model.productionStartYear) && (!model.productionEndYear || model.productionEndYear >= currentYear - 2),
  );
  const heritageModels = make.models.filter((model) => model.productionEndYear && model.productionEndYear < currentYear - 2);
  const archiveModels = make.models.filter((model) => !model.productionStartYear && !model.productionEndYear);
  const style = { "--maker-accent": config.accent } as CSSProperties;

  return (
    <main className="maker-site" style={style}>
      <section className="maker-site-hero">
        {flagship?.images[0]?.url ? <img src={flagship.images[0].url} alt={`${make.name} ${flagship.name}`} /> : null}
        <div className="maker-site-hero-shade" />
        <div className="maker-site-hero-copy">
          {make.logoUrl ? <img className="maker-site-logo" src={make.logoUrl} alt={`${make.name} logo`} /> : null}
          <p>Brand Central</p>
          <h1>{flagship?.name || make.name}</h1>
          <span>Every {make.name} model, past and present, connected to ownership intelligence and parts.</span>
          {flagship ? <Link href={`/models/${flagship.slug}`}>Explore {flagship.name}</Link> : null}
        </div>
      </section>

      <section className="maker-site-catalog" aria-labelledby="maker-catalog-title">
        <header>
          <div>
            <p>{make.name}</p>
            <h2 id="maker-catalog-title">Full Model Lineup</h2>
          </div>
          <span>{make.models.length} models</span>
        </header>
        <ModelSection title="Current Lineup" models={currentModels} />
        <ModelSection title="Heritage" models={heritageModels} />
        <ModelSection title="Model Archive" models={archiveModels} />
      </section>
    </main>
  );
}

type ModelCard = NonNullable<Awaited<ReturnType<typeof getMakerSiteCatalog>>>["models"][number];

function ModelSection({ title, models }: { title: string; models: ModelCard[] }) {
  if (models.length === 0) return null;
  return (
    <section className="maker-site-model-section">
      <h3>{title}</h3>
      <div className="maker-site-model-grid">
        {models.map((model) => (
          <Link key={model.id} href={`/models/${model.slug}`} className="maker-site-model-card">
            <span className="maker-site-model-copy">
              <small>{formatYears(model.productionStartYear, model.productionEndYear)}</small>
              <strong>{model.name}</strong>
              <span>{model.category || model.bodyStyle || "Performance vehicle"}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function formatYears(start: number | null, end: number | null) {
  if (!start) return "Model history";
  if (!end) return `${start} - present`;
  return start === end ? String(start) : `${start} - ${end}`;
}
