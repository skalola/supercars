/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";
import { isAffiliateTrackingReady } from "@/lib/parts/affiliate-tracking";
import { auditPerformancePartTrust } from "@/lib/parts/trust";
import { prisma } from "@/lib/prisma";

type PartDetailPageProps = {
  params: Promise<{
    brandSlug: string;
    partSlug: string;
  }>;
};

export default async function PartDetailPage({ params }: PartDetailPageProps) {
  const { brandSlug, partSlug } = await params;

  const part = await prisma.performancePart.findFirst({
    where: {
      slug: partSlug,
      brand: {
        slug: brandSlug,
      },
      status: "ACTIVE",
    },
    include: {
      category: true,
      brand: true,
      affiliatePartner: true,
      compatibility: {
        include: {
          make: true,
          model: true,
        },
        orderBy: [
          { make: { name: "asc" } },
          { model: { name: "asc" } },
          { yearStart: "asc" },
        ],
      },
    },
  });

  if (!part || !auditPerformancePartTrust(part).publicEligible) notFound();

  const trackingReady = isAffiliateTrackingReady(part);
  const fitmentRows = part.compatibility.map(formatPartCompatibility);

  return (
    <main className="part-detail-shell">
      <section className="part-detail-hero">
        <div className="part-detail-media">
          {part.imageUrl ? (
            <img src={part.imageUrl} alt="" />
          ) : (
            <span>{part.category.name}</span>
          )}
        </div>

        <div className="part-detail-summary">
          <Link href="/parts" className="part-detail-back">
            Parts Shop
          </Link>
          <div>
            <p className="garage-page-eyebrow">{part.category.name}</p>
            <h1>{part.name}</h1>
            <p>
              {part.description || "Source-verified performance part with model-aware compatibility captured for SUPERCAR DASH vehicle builds."}
            </p>
          </div>

          <div className="part-detail-brand-row">
            {part.brand.logoUrl ? <img src={part.brand.logoUrl} alt="" /> : null}
            <div>
              <span>Brand</span>
              <strong>{part.brand.name}</strong>
              {part.brand.country ? <em>{part.brand.country}</em> : null}
            </div>
          </div>

          <div className="part-detail-actions">
            {part.sourceUrl ? (
              <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer">
                Review Source
              </a>
            ) : (
              <span>No source link</span>
            )}
            {trackingReady ? (
              <a href={`/out/parts/${part.id}?source=/parts/${part.brand.slug}/${part.slug}`} rel="nofollow sponsored">
                Shop Partner{part.affiliatePartner?.name ? `: ${part.affiliatePartner.name}` : ""}
              </a>
            ) : (
              <button type="button" disabled>
                Affiliate Pending
              </button>
            )}
          </div>

          <p className="part-detail-disclosure">
            SUPERCAR DASH may earn a commission from approved partner links once affiliate routing is activated.
          </p>
        </div>
      </section>

      <section className="part-detail-grid">
        <article className="part-detail-panel">
          <p className="garage-page-eyebrow">Part Intelligence</p>
          <h2>Specs</h2>
          <div className="part-detail-spec-grid">
            <SpecTile label="Retail Price" value={formatPartPrice(part.retailPriceCents)} />
            <SpecTile label="HP Gain" value={formatGain(part.estimatedHpGain, "hp")} />
            <SpecTile label="Torque Gain" value={formatGain(part.estimatedTorqueGain, "lb-ft")} />
            <SpecTile label="Install" value={formatEnumLabel(part.installComplexity) || "Install details pending"} />
            <SpecTile label="Part Number" value={part.partNumber || "Not listed"} />
            <SpecTile label="Source Confidence" value={formatEnumLabel(part.sourceConfidence)} />
          </div>
          {part.gainBasis ? <p className="part-detail-note">{part.gainBasis}</p> : null}
          {part.notes ? <p className="part-detail-note">{part.notes}</p> : null}
        </article>

        <article className="part-detail-panel">
          <p className="garage-page-eyebrow">Fitment</p>
          <h2>Compatible Models</h2>
          {fitmentRows.length === 0 ? (
            <p className="part-detail-muted">Universal or unscoped fitment. Admin review should narrow this when a source confirms model compatibility.</p>
          ) : (
            <div className="part-detail-fitment-list">
              {fitmentRows.map((fitment) => (
                <div key={`${fitment.label}-${fitment.detail}`}>
                  <strong>{fitment.label}</strong>
                  <span>{fitment.detail}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="part-detail-panel">
          <p className="garage-page-eyebrow">Attribution</p>
          <h2>Source</h2>
          <dl className="part-detail-source-list">
            <div>
              <dt>Source Name</dt>
              <dd>{part.sourceName || part.brand.name}</dd>
            </div>
            <div>
              <dt>Retailer</dt>
              <dd>{part.retailerName || "Not configured"}</dd>
            </div>
            <div>
              <dt>Tracking</dt>
              <dd>{trackingReady ? "Ready" : formatEnumLabel(part.trackingStatus)}</dd>
            </div>
            {part.sourceUrl ? (
              <div>
                <dt>Official Link</dt>
                <dd>
                  <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer">
                    Open source page
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        </article>
      </section>
    </main>
  );
}

function SpecTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="part-detail-spec-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatPartPrice(value: number | null) {
  if (value === null) return "Price pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function formatGain(value: number | null, unit: string) {
  return value === null ? "Pending" : `+${value.toLocaleString()} ${unit}`;
}

function formatEnumLabel(value: string | null) {
  if (!value) return "";
  return value
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function formatPartCompatibility(partCompatibility: {
  make: { name: string } | null;
  model: { name: string } | null;
  yearStart: number | null;
  yearEnd: number | null;
  trim: string | null;
  engine: string | null;
}) {
  const label = [partCompatibility.make?.name, partCompatibility.model?.name].filter(Boolean).join(" ") || "Universal";
  const detail = [
    formatPartYearRange(partCompatibility.yearStart, partCompatibility.yearEnd),
    partCompatibility.trim,
    partCompatibility.engine,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    label,
    detail: detail || "Fitment scope pending finer details",
  };
}

function formatPartYearRange(start: number | null, end: number | null) {
  if (start && end) return start === end ? String(start) : `${start}-${end}`;
  if (start) return `${start}+`;
  if (end) return `Through ${end}`;
  return null;
}
