import Link from "next/link";
import { getCatalogMakeSummaries } from "@/lib/makes/catalog";
import { getMakeMetadata } from "@/lib/makes/make-metadata";

const regionOrder = ["Japan", "Europe", "United Kingdom", "United States", "Korea", "China", "Specialist / Tuner"];

export default async function MakesPage() {
  const makes = await getCatalogMakeSummaries();
  const totalModels = makes.reduce((total, make) => total + make.modelCount, 0);

  const groupedMakes = regionOrder
    .map((region) => ({
      region,
      makes: makes
        .filter((make) => (make.region || getMakeMetadata(make.slug).region) === region)
        .sort((a, b) => b.modelCount - a.modelCount || a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.makes.length > 0);

  return (
    <main className="garage-page-shell makes-page-shell">
      <section className="garage-page-header makes-page-header">
        <div>
          <div className="garage-page-eyebrow">Brand Central</div>
          <h1>Choose Your Manufacturer</h1>
          <p>Browse the SUPERCAR DASH model catalog by region, then add dream cars, track listings, and follow market data from each make.</p>
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

      <section className="makes-region-list" aria-label="Makes by region">
        {groupedMakes.map((group) => (
          <section key={group.region} className="makes-region-section">
            <div className="makes-region-heading">
              <span>{group.region}</span>
              <strong>{group.makes.length} {group.makes.length === 1 ? "make" : "makes"}</strong>
            </div>
            <div className="makes-logo-grid">
              {group.makes.map((make) => (
                <Link key={make.id} href={`/make/${make.slug}`} className="makes-logo-card">
                  <span className="makes-logo-mark">
                    {make.logoUrl ? (
                      <img src={make.logoUrl} alt="" loading="lazy" />
                    ) : (
                      <span>{getInitials(make.name)}</span>
                    )}
                  </span>
                  <span className="makes-logo-name">{make.name}</span>
                  <small>{make.modelCount.toLocaleString()} models</small>
                  {make.modelPreviewNames.length > 0 ? (
                    <span className="makes-model-preview">
                      {make.modelPreviewNames.join(" · ")}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
