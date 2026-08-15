/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { PartDetailBuildActions, type PartDetailFitmentOption, type PartDetailGarageCar } from "@/components/parts/PartDetailBuildActions";
import { PartDetailGallery, type PartDetailGalleryImage } from "@/components/parts/PartDetailGallery";
import { isAffiliateTrackingReady, isSafeOutboundUrl } from "@/lib/parts/affiliate-tracking";
import { getPartDetailPath } from "@/lib/parts/routes";
import { auditPerformancePartTrust } from "@/lib/parts/trust";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { absoluteUrl, buildPublicMetadata, privateMetadata, safeJsonLd } from "@/lib/seo";

type PartDetailPageProps = {
  params: Promise<{
    brandSlug: string;
    partSlug: string;
  }>;
  searchParams?: Promise<{ vehicleId?: string | string[] }>;
};

export async function generateMetadata({ params }: PartDetailPageProps): Promise<Metadata> {
  const { brandSlug, partSlug } = await params;
  const part = await getPublicPartDetail(brandSlug, partSlug);
  if (!part || !auditPerformancePartTrust(part).publicEligible) return privateMetadata;
  const fitmentNames = Array.from(new Set(
    part.compatibility
      .flatMap((fitment) => [fitment.make?.name, fitment.model?.name])
      .filter((value): value is string => Boolean(value)),
  )).slice(0, 4);

  return buildPublicMetadata({
    title: `${part.brand.name} ${part.name}`,
    description: (part.description || `${part.brand.name} ${part.name} for ${fitmentNames.join(" ") || "compatible enthusiast vehicles"}. View fitment, specifications, and current marketplace offers.`).slice(0, 160),
    path: `/parts/${brandSlug}/${partSlug}`,
    image: part.imageUrl,
    keywords: [part.brand.name, part.name, part.category.name, ...fitmentNames],
  });
}

const partDetailSelect = {
  id: true,
  categoryId: true,
  brandId: true,
  name: true,
  slug: true,
  partNumber: true,
  oemPartNumber: true,
  componentType: true,
  description: true,
  imageUrl: true,
  sourceUrl: true,
  sourceName: true,
  sourceCatalog: true,
  sourceCategory: true,
  diagramReference: true,
  sourceConfidence: true,
  status: true,
  retailPriceCents: true,
  retailerName: true,
  affiliateUrl: true,
  trackingStatus: true,
  lastCheckedAt: true,
  estimatedHpGain: true,
  estimatedTorqueGain: true,
  gainBasis: true,
  installComplexity: true,
  notes: true,
  category: {
    select: {
      name: true,
      slug: true,
    },
  },
  catalogNode: {
    select: { name: true },
  },
  brand: {
    select: {
      name: true,
      slug: true,
      logoUrl: true,
    },
  },
  affiliatePartner: {
    select: {
      name: true,
      active: true,
      status: true,
    },
  },
  compatibility: {
    select: {
      makeId: true,
      modelId: true,
      yearStart: true,
      yearEnd: true,
      trim: true,
      engine: true,
      make: {
        select: { name: true },
      },
      model: {
        select: { name: true },
      },
    },
    orderBy: [
      { make: { name: "asc" } },
      { model: { name: "asc" } },
      { yearStart: "asc" },
    ],
    take: 100,
  },
  offers: {
    where: { active: true },
    select: {
      id: true,
      provider: true,
      title: true,
      priceCents: true,
      currency: true,
      condition: true,
      sellerName: true,
      sellerFeedbackPercentage: true,
      sellerQualityScore: true,
      imageUrl: true,
      affiliateUrl: true,
      oemMatchType: true,
      genuineOemStatus: true,
      compatibilityStatus: true,
      fitmentConfidence: true,
      confidenceScore: true,
      shippingCostCents: true,
      shippingCurrency: true,
      expiresAt: true,
      lastCheckedAt: true,
    },
    orderBy: [{ confidenceScore: "desc" }, { priceCents: "asc" }],
    take: 12,
  },
} satisfies Prisma.PerformancePartSelect;

const relatedPartSelect = {
  id: true,
  categoryId: true,
  brandId: true,
  name: true,
  slug: true,
  imageUrl: true,
  sourceUrl: true,
  sourceConfidence: true,
  status: true,
  retailPriceCents: true,
  estimatedHpGain: true,
  estimatedTorqueGain: true,
  category: {
    select: { name: true },
  },
  brand: {
    select: {
      name: true,
      slug: true,
    },
  },
  compatibility: {
    select: {
      makeId: true,
      modelId: true,
      yearStart: true,
      yearEnd: true,
    },
    take: 24,
  },
} satisfies Prisma.PerformancePartSelect;

type RelatedPart = Prisma.PerformancePartGetPayload<{ select: typeof relatedPartSelect }>;

export default async function PartDetailPage({ params, searchParams }: PartDetailPageProps) {
  const { brandSlug, partSlug } = await params;
  const query = await searchParams;
  const requestedVehicleId = typeof query?.vehicleId === "string" ? query.vehicleId : undefined;
  const session = await auth();
  const userId = session?.user?.id as string | undefined;

  const [part, garageCars] = await Promise.all([
    getPublicPartDetail(brandSlug, partSlug),
    getClaimedGarageCars(userId),
  ]);

  if (!part || !auditPerformancePartTrust(part).publicEligible) notFound();

  const trackingReady = isAffiliateTrackingReady(part);
  const fitmentRows = part.compatibility.map(formatPartCompatibility);
  const fitmentOptions = getFitmentOptions(part.compatibility);
  const compatibleMakeIds = unique(part.compatibility.map((fitment) => fitment.makeId).filter(isPresent));
  const compatibleModelIds = unique(part.compatibility.map((fitment) => fitment.modelId).filter(isPresent));
  const relatedParts = await getRelatedParts(part.id, part.categoryId, part.brandId, compatibleMakeIds, compatibleModelIds);
  const activeOffers = part.offers.filter((offer) =>
    Boolean(offer.affiliateUrl) && (!offer.expiresAt || offer.expiresAt > new Date()),
  );
  const bestOffer = activeOffers[0] ?? null;
  const title = part.name.toUpperCase();
  const priceLabel = bestOffer
    ? formatOfferPrice(bestOffer.priceCents, bestOffer.currency)
    : formatPartPrice(part.retailPriceCents);
  const priceContext = bestOffer
    ? `${formatProvider(bestOffer.provider)} / ${bestOffer.sellerName || "Marketplace seller"}`
    : part.retailPriceCents != null
      ? "Catalog reference price"
      : "No active purchase offer";
  const galleryImages = buildPartGalleryImages({
    partName: part.name,
    categoryName: part.category.name,
    imageUrl: part.imageUrl,
    brandName: part.brand.name,
    brandLogoUrl: part.brand.logoUrl,
  });
  const hasAffiliateLink = isSafeOutboundUrl(part.affiliateUrl);
  const hasSourceLink = isSafeOutboundUrl(part.sourceUrl);
  const hasRetailerLink = hasAffiliateLink || hasSourceLink;
  const retailerRouteLabel = bestOffer ? "Marketplace Offer" : trackingReady ? "Affiliate Ready" : hasSourceLink ? "Catalog Source" : "Offer Pending";
  const retailerRouteDetail = bestOffer
    ? `${formatProvider(bestOffer.provider)} / ${bestOffer.sellerName || "Marketplace seller"}`
    : trackingReady
    ? part.affiliatePartner?.name || "Approved partner route"
    : hasSourceLink
      ? part.retailerName || part.sourceName || "Original source"
      : "No safe outbound URL captured";
  const retailerHref = hasRetailerLink ? `/out/parts/${part.id}?source=/parts/${part.brand.slug}/${part.slug}` : null;
  const primaryOfferHref = bestOffer
    ? `/out/parts/offers/${bestOffer.id}?source=/parts/${part.brand.slug}/${part.slug}${requestedVehicleId ? `&vehicleId=${encodeURIComponent(requestedVehicleId)}` : ""}`
    : null;
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: part.name,
    description: part.description || undefined,
    image: part.imageUrl ? [absoluteUrl(part.imageUrl)] : undefined,
    sku: part.partNumber || part.oemPartNumber || undefined,
    brand: { "@type": "Brand", name: part.brand.name },
    category: part.category.name,
    url: absoluteUrl(`/parts/${part.brand.slug}/${part.slug}`),
    offers: bestOffer && bestOffer.priceCents != null ? {
      "@type": "Offer",
      price: bestOffer.priceCents / 100,
      priceCurrency: bestOffer.currency,
      availability: "https://schema.org/InStock",
      url: absoluteUrl(`/parts/${part.brand.slug}/${part.slug}`),
      seller: bestOffer.sellerName ? { "@type": "Organization", name: bestOffer.sellerName } : undefined,
    } : undefined,
  };

  return (
    <main className="part-detail-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd) }} />
      <section className="part-detail-hero">
        <div className="part-detail-showcase">
          <Link href="/parts" className="part-detail-back">
            Back To Parts Shop
          </Link>
          <div>
            <div className="part-detail-title-row">
              <span>{part.category.name}</span>
              <em>{part.brand.name}</em>
            </div>
            <h1>{title}</h1>
          </div>

          <PartDetailGallery images={galleryImages} fallbackLabel={part.category.name} />
        </div>

        <aside className="part-detail-action-panel">
          <div className="part-detail-price-row">
            <div>
              <span>{bestOffer ? "Best Available Offer" : "Reference Price"}</span>
              <strong>{priceLabel}</strong>
              <small>{priceContext}</small>
            </div>
            <StatTile label="Peak Power" value={formatGain(part.estimatedHpGain, "HP")} />
            <StatTile label="Peak Torque" value={formatGain(part.estimatedTorqueGain, "TQ")} />
          </div>

          <PartDetailBuildActions
            partId={part.id}
            partName={part.name}
            garageCars={garageCars}
            fitmentOptions={fitmentOptions}
            compatibleMakeIds={compatibleMakeIds}
            compatibleModelIds={compatibleModelIds}
          />

          <div className="part-detail-install-mini">
            <span>Install Difficulty</span>
            <strong>{formatEnumLabel(part.installComplexity) || "Review Needed"}</strong>
            <div aria-hidden="true">
              {Array.from({ length: 5 }).map((_, index) => (
                <i key={index} className={index < getInstallDots(part.installComplexity) ? "is-filled" : ""} />
              ))}
            </div>
          </div>

          <div className="part-detail-actions">
            {primaryOfferHref ? (
              <a href={primaryOfferHref} target="_blank" rel="nofollow sponsored">
                View Best Offer
              </a>
            ) : retailerHref ? (
              <a href={retailerHref} target="_blank" rel={trackingReady ? "nofollow sponsored" : "noopener noreferrer"}>
                View Catalog Source
              </a>
            ) : (
              <span>Retailer pending</span>
            )}
            {part.sourceUrl ? (
              <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer">
                Source
              </a>
            ) : null}
          </div>

          <div className={`part-detail-outbound-status${bestOffer || trackingReady ? " is-affiliate" : hasSourceLink ? " is-source" : " is-pending"}`}>
            <span>{retailerRouteLabel}</span>
            <strong>{retailerRouteDetail}</strong>
          </div>

          <p className="part-detail-disclosure">
            SupercarDash may earn a commission when you purchase through partner links.
          </p>
        </aside>
      </section>

      <section className="part-detail-dashboard-grid">
        <article className="part-detail-panel">
          <div className="part-detail-panel-heading">
            <span>▣</span>
            <h2>Part Passport</h2>
          </div>
          <div className="part-detail-passport-summary">
            {part.brand.logoUrl ? <img src={part.brand.logoUrl} alt="" /> : <div>{part.brand.name.slice(0, 2)}</div>}
            <section>
              <span>{part.brand.name}</span>
              <strong>{part.name}</strong>
              <em className={getStatusTone(part.sourceConfidence)}>{formatEnumLabel(part.sourceConfidence)}</em>
            </section>
          </div>
          {part.description ? <p className="part-detail-note">{part.description}</p> : null}
          <dl className="part-detail-source-list">
            <SpecRow label="Brand" value={part.brand.name} />
            <SpecRow label="System" value={part.catalogNode?.name || part.category.name} />
            <SpecRow label="Category" value={part.category.name} />
            <SpecRow label="Component Type" value={part.componentType || part.name} />
            <SpecRow label="Part Number" value={part.partNumber || "Not listed"} />
            <SpecRow label="OEM Number" value={part.oemPartNumber || "Not listed"} />
            <SpecRow label="Material" value={inferMaterial(part)} />
            <SpecRow label="Canonical Source" value={part.sourceName || "Not captured"} />
            <SpecRow label="Source Catalog" value={formatEnumLabel(part.sourceCatalog) || "Not captured"} />
            <SpecRow label="Source Category" value={part.sourceCategory || "Not captured"} />
            <SpecRow label="Diagram Reference" value={part.diagramReference || "Not captured"} />
            <SpecRow label="Last Checked" value={formatDate(part.lastCheckedAt)} />
            <SpecRow label="Tracking" value={trackingReady ? "Affiliate ready" : formatEnumLabel(part.trackingStatus)} />
          </dl>
        </article>

        <article className="part-detail-panel">
          <div className="part-detail-panel-heading">
            <span>▰</span>
            <h2>Fitment</h2>
            {fitmentRows.length > 0 ? <em>{fitmentRows.length.toLocaleString()} records</em> : null}
          </div>
          {fitmentRows.length === 0 ? (
            <p className="part-detail-muted">Universal or unscoped fitment. Verify against the retailer before ordering.</p>
          ) : (
            <div className="part-detail-fitment-list">
              {fitmentRows.slice(0, 6).map((fitment) => (
                <div key={`${fitment.label}-${fitment.detail}`}>
                  <strong>{fitment.label}</strong>
                  <span>{fitment.detail}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="part-detail-panel part-detail-performance-panel">
          <div className="part-detail-panel-heading">
            <span>▰</span>
            <h2>Performance Impact</h2>
          </div>
          <div className="part-detail-performance-stats">
            <StatTile label="HP Gain" value={formatGain(part.estimatedHpGain, "HP")} />
            <StatTile label="TQ Gain" value={formatGain(part.estimatedTorqueGain, "TQ")} />
            <StatTile label="Basis" value={part.gainBasis ? "Source stated" : "Not captured"} />
          </div>
          <div className="part-detail-impact-meter" aria-label="Estimated horsepower and torque gains">
            <GainMeter label="Power Gain" value={part.estimatedHpGain} unit="HP" tone="power" />
            <GainMeter label="Torque Gain" value={part.estimatedTorqueGain} unit="TQ" tone="torque" />
            <p>
              {part.gainBasis
                ? "Performance values are stored from the captured source claim. Dyno curve data is not captured yet."
                : "No source-backed performance claim is captured yet."}
            </p>
          </div>
          {part.gainBasis ? <p className="part-detail-note">{part.gainBasis}</p> : null}
        </article>

        <article className="part-detail-panel">
          <div className="part-detail-panel-heading">
            <span>✕</span>
            <h2>Installation</h2>
          </div>
          <dl className="part-detail-source-list">
            <SpecRow label="Install Time" value={getInstallTimeLabel(part.installComplexity)} />
            <SpecRow label="Difficulty" value={formatEnumLabel(part.installComplexity) || "Review needed"} />
            <SpecRow label="Requires Tuning" value={getTuningLabel(part.category.slug)} />
            <SpecRow label="Notes" value={part.notes || "Professional installation recommended for performance parts."} />
          </dl>
        </article>
      </section>

      <section className="part-detail-offers" aria-labelledby="marketplace-offers-title">
        <div className="part-detail-panel-heading">
          <span>◇</span>
          <h2 id="marketplace-offers-title">Available Marketplace Offers</h2>
          {activeOffers.length > 0 ? <em>{activeOffers.length.toLocaleString()} live</em> : null}
        </div>
        {activeOffers.length === 0 ? (
          <p className="part-detail-muted">No verified marketplace offers are active right now. The canonical part and fitment remain available.</p>
        ) : (
          <div className="part-detail-offer-grid">
            {activeOffers.map((offer) => (
              <article key={offer.id} className="part-detail-offer-card">
                <div className="part-detail-offer-media">
                  {offer.imageUrl ? <img src={offer.imageUrl} alt="" /> : <span>{offer.provider}</span>}
                </div>
                <div className="part-detail-offer-copy">
                  <div>
                    <span>Marketplace: {formatProvider(offer.provider)}</span>
                    <em className={`is-${offer.fitmentConfidence.toLowerCase()}`}>
                      {["EXACT_MATCH", "HIGH_CONFIDENCE", "HIGH"].includes(offer.fitmentConfidence) ? "High-confidence fit" : "Verify fitment"}
                    </em>
                  </div>
                  <strong>{offer.title}</strong>
                  <p>Seller: {offer.sellerName || "Unavailable"}</p>
                  <p>{[
                    offer.condition,
                    offer.genuineOemStatus === "CLAIMED" ? "Seller claims OEM/genuine" : null,
                    offer.oemMatchType === "EXACT" ? "Exact OEM number" : null,
                  ].filter(Boolean).join(" / ") || "Offer details unavailable"}</p>
                  {offer.sellerFeedbackPercentage != null ? <small>{offer.sellerFeedbackPercentage.toFixed(1)}% seller feedback</small> : null}
                </div>
                <div className="part-detail-offer-action">
                  <strong>{formatOfferPrice(offer.priceCents, offer.currency)}</strong>
                  <a
                    href={`/out/parts/offers/${offer.id}?source=/parts/${part.brand.slug}/${part.slug}${requestedVehicleId ? `&vehicleId=${encodeURIComponent(requestedVehicleId)}` : ""}`}
                    target="_blank"
                    rel="nofollow sponsored"
                  >
                    Buy on {formatProvider(offer.provider)}
                  </a>
                  <small>Verify fitment before purchase</small>
                  {offer.shippingCostCents != null ? (
                    <small>Shipping {formatOfferPrice(offer.shippingCostCents, offer.shippingCurrency || offer.currency)}</small>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="part-detail-disclosure">SupercarDash may earn a commission when you purchase through partner links.</p>
      </section>

      <section className="part-detail-recommendations">
        <div className="part-detail-panel-heading">
          <span>◇</span>
          <h2>You Might Also Like</h2>
        </div>
        {relatedParts.length === 0 ? (
          <p className="part-detail-muted">No similar active parts are ready yet.</p>
        ) : (
          <div className="part-detail-related-grid">
            {relatedParts.map((relatedPart) => {
              const recommendation = getRecommendationLabel(relatedPart, {
                categoryId: part.categoryId,
                brandId: part.brandId,
                makeIds: compatibleMakeIds,
                modelIds: compatibleModelIds,
              });

              return (
                <Link key={relatedPart.id} href={getPartDetailPath(relatedPart)} className="part-detail-related-card">
                  <span>{recommendation}</span>
                  {relatedPart.imageUrl ? <img src={relatedPart.imageUrl} alt="" /> : <div>{relatedPart.category.name}</div>}
                  <strong>{relatedPart.name}</strong>
                  <small>{[relatedPart.category.name, relatedPart.brand.name].join(" / ")}</small>
                  <p>{formatRelatedFitment(relatedPart.compatibility, { makeIds: compatibleMakeIds, modelIds: compatibleModelIds })}</p>
                  <em>{relatedPart.retailPriceCents == null ? "Offer pending" : `Reference ${formatPartPrice(relatedPart.retailPriceCents)}`}</em>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const isMissing = value === "Not captured";

  return (
    <div className={`part-detail-spec-tile${isMissing ? " is-muted" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GainMeter({ label, value, unit, tone }: { label: string; value: number | null; unit: string; tone: "power" | "torque" }) {
  const isMissing = value === null;
  const width = isMissing ? 0 : Math.max(8, Math.min(100, Math.round((Math.abs(value) / 80) * 100)));

  return (
    <div className={`part-detail-gain-meter is-${tone}${isMissing ? " is-muted" : ""}`}>
      <div>
        <span>{label}</span>
        <strong>{value === null ? "Not captured" : `+${value.toLocaleString()} ${unit}`}</strong>
      </div>
      <div className="part-detail-gain-track" aria-hidden="true">
        <i style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function buildPartGalleryImages(input: {
  partName: string;
  categoryName: string;
  imageUrl: string | null;
  brandName: string;
  brandLogoUrl: string | null;
}): PartDetailGalleryImage[] {
  const images: PartDetailGalleryImage[] = [];

  if (input.imageUrl) {
    images.push({
      id: "product-primary",
      src: input.imageUrl,
      alt: input.partName,
      label: `${input.partName} product image`,
      tone: "product",
    });
  }

  if (input.brandLogoUrl) {
    images.push({
      id: "brand-mark",
      src: input.brandLogoUrl,
      alt: `${input.brandName} logo`,
      label: `${input.brandName} brand mark`,
      tone: "brand",
    });
  }

  return images;
}

async function getClaimedGarageCars(userId: string | undefined): Promise<PartDetailGarageCar[]> {
  if (!userId) return [];

  const vehicles = await prisma.vehicle.findMany({
    where: {
      ownerId: userId,
      status: "CLAIMED",
    },
    select: {
      id: true,
      vin: true,
      year: true,
      trim: true,
      modelId: true,
      photos: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: { filePath: true },
        take: 1,
      },
      images: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { url: true },
        take: 1,
      },
      model: {
        select: {
          name: true,
          makeId: true,
          make: { select: { name: true } },
          images: {
            orderBy: [{ type: "asc" }, { createdAt: "asc" }],
            select: { url: true },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
    take: 25,
  });

  return vehicles.map((vehicle) => ({
    id: vehicle.id,
    vin: vehicle.vin,
    label: [vehicle.year, vehicle.model.make.name, vehicle.model.name, vehicle.trim].filter(Boolean).join(" "),
    detail: `VIN ${vehicle.vin.slice(-6)}`,
    makeId: vehicle.model.makeId,
    modelId: vehicle.modelId,
    imageUrl: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || null,
  }));
}

const getPublicPartDetail = unstable_cache(
  (brandSlug: string, partSlug: string) => prisma.performancePart.findFirst({
    where: {
      slug: partSlug,
      brand: { slug: brandSlug },
      status: "ACTIVE",
      sourceUrl: { not: null },
      sourceConfidence: "SOURCE_VERIFIED",
      imageUrl: { not: null },
      compatibility: {
        some: {
          OR: [
            { makeId: { not: null } },
            { modelId: { not: null } },
          ],
        },
      },
    },
    select: partDetailSelect,
  }),
  ["public-part-detail-v2"],
  { revalidate: 60 * 60, tags: ["parts-catalog"] },
);

const getRelatedParts = unstable_cache(
  async (
    partId: string,
    categoryId: string,
    brandId: string,
    makeIds: string[],
    modelIds: string[],
  ) => {
    const relatedConditions = [
      { categoryId },
      { brandId },
      ...(makeIds.length > 0 ? [{ compatibility: { some: { makeId: { in: makeIds } } } }] : []),
      ...(modelIds.length > 0 ? [{ compatibility: { some: { modelId: { in: modelIds } } } }] : []),
    ];

    const parts = await prisma.performancePart.findMany({
      where: {
        id: { not: partId },
        status: "ACTIVE",
        AND: [
          { OR: relatedConditions },
          ...(makeIds.length > 0 || modelIds.length > 0 ? [{
            compatibility: {
              some: {
                OR: [
                  ...(makeIds.length > 0 ? [{ makeId: { in: makeIds } }] : []),
                  ...(modelIds.length > 0 ? [{ modelId: { in: modelIds } }] : []),
                ],
              },
            },
          }] : []),
        ],
      },
      select: relatedPartSelect,
      orderBy: [
        { category: { displayOrder: "asc" } },
        { brand: { name: "asc" } },
        { name: "asc" },
      ],
      take: 20,
    });

    return parts
      .map((part) => ({
        ...part,
        compatibility: [...part.compatibility].sort(compareRelatedFitments),
      }))
      .filter((part) => auditPerformancePartTrust(part).publicEligible)
      .map((part) => ({
        part,
        score: scoreRelatedPart(part, { categoryId, brandId, makeIds, modelIds }),
      }))
      .sort((a, b) => b.score - a.score || a.part.name.localeCompare(b.part.name))
      .map(({ part }) => part)
      .slice(0, 5);
  },
  ["public-related-parts-v2"],
  { revalidate: 60 * 60, tags: ["parts-catalog"] },
);

function compareRelatedFitments(
  left: RelatedPart["compatibility"][number],
  right: RelatedPart["compatibility"][number],
) {
  return (
    (left.makeId || "").localeCompare(right.makeId || "") ||
    (left.modelId || "").localeCompare(right.modelId || "") ||
    (left.yearStart ?? 0) - (right.yearStart ?? 0) ||
    (left.yearEnd ?? 0) - (right.yearEnd ?? 0)
  );
}

function scoreRelatedPart(
  part: {
    categoryId: string;
    brandId: string;
    estimatedHpGain: number | null;
    estimatedTorqueGain: number | null;
    retailPriceCents: number | null;
    compatibility: Array<{ makeId: string | null; modelId: string | null }>;
  },
  current: { categoryId: string; brandId: string; makeIds: string[]; modelIds: string[] },
) {
  const partMakeIds = new Set(part.compatibility.map((fitment) => fitment.makeId).filter(isPresent));
  const partModelIds = new Set(part.compatibility.map((fitment) => fitment.modelId).filter(isPresent));
  const sameModel = current.modelIds.some((modelId) => partModelIds.has(modelId));
  const sameMake = current.makeIds.some((makeId) => partMakeIds.has(makeId));

  return [
    sameModel ? 80 : 0,
    sameMake ? 45 : 0,
    part.categoryId === current.categoryId ? 32 : 0,
    part.brandId === current.brandId ? 22 : 0,
    part.estimatedHpGain !== null || part.estimatedTorqueGain !== null ? 8 : 0,
    part.retailPriceCents !== null ? 5 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function getRecommendationLabel(
  part: RelatedPart,
  current: { categoryId: string; brandId: string; makeIds: string[]; modelIds: string[] },
) {
  const partMakeIds = new Set(part.compatibility.map((fitment) => fitment.makeId).filter(isPresent));
  const partModelIds = new Set(part.compatibility.map((fitment) => fitment.modelId).filter(isPresent));
  if (current.modelIds.some((modelId) => partModelIds.has(modelId))) return "Same Model";
  if (current.makeIds.some((makeId) => partMakeIds.has(makeId))) return "Same Make";
  if (part.categoryId === current.categoryId) return "Same System";
  if (part.brandId === current.brandId) return "Same Brand";
  return "Recommended";
}

function formatPartPrice(value: number | null) {
  if (value === null) return "Price pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function formatOfferPrice(value: number | null, currency: string) {
  if (value === null) return "Price unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatProvider(value: string) {
  return value === "EBAY" ? "eBay" : formatEnumLabel(value);
}

function formatGain(value: number | null, unit: string) {
  return value === null ? "Not captured" : `+${value.toLocaleString()} ${unit}`;
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

function formatRelatedFitment(
  compatibility: Array<{
    makeId: string | null;
    modelId: string | null;
    yearStart: number | null;
    yearEnd: number | null;
  }>,
  current: { makeIds: string[]; modelIds: string[] },
) {
  if (compatibility.length === 0) return "Universal / fitment review";
  const first =
    compatibility.find((fitment) => fitment.modelId && current.modelIds.includes(fitment.modelId)) ||
    compatibility.find((fitment) => fitment.makeId && current.makeIds.includes(fitment.makeId)) ||
    compatibility[0];
  const makeModel = first.modelId
    ? current.modelIds.includes(first.modelId)
      ? "Same model"
      : "Model fitment"
    : first.makeId
      ? current.makeIds.includes(first.makeId)
        ? "Same make"
        : "Make fitment"
      : "Universal";
  const years = formatPartYearRange(first.yearStart, first.yearEnd);
  const suffix = compatibility.length > 1 ? ` +${(compatibility.length - 1).toLocaleString()} more` : "";
  return [makeModel || "Universal", years].filter(Boolean).join(" · ") + suffix;
}

function getFitmentOptions(
  compatibility: Array<{
    makeId: string | null;
    modelId: string | null;
    make: { name: string } | null;
    model: { name: string } | null;
    yearStart: number | null;
    yearEnd: number | null;
    trim: string | null;
    engine: string | null;
  }>,
): PartDetailFitmentOption[] {
  const seen = new Set<string>();
  return compatibility
    .map((fitment) => {
      const formatted = formatPartCompatibility(fitment);
      return {
        makeId: fitment.makeId,
        makeName: fitment.make?.name ?? null,
        modelId: fitment.modelId,
        modelName: fitment.model?.name ?? null,
        detail: formatted.detail,
      };
    })
    .filter((fitment) => {
      const key = `${fitment.makeId || "all"}:${fitment.modelId || "all"}:${fitment.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(fitment.makeId || fitment.modelId);
    });
}

function formatPartYearRange(start: number | null, end: number | null) {
  if (start && end) return start === end ? String(start) : `${start}-${end}`;
  if (start) return `${start}+`;
  if (end) return `Through ${end}`;
  return null;
}

function getInstallDots(value: string | null) {
  const normalized = value?.toLowerCase() || "";
  if (normalized.includes("easy") || normalized.includes("basic")) return 2;
  if (normalized.includes("moderate") || normalized.includes("medium")) return 3;
  if (normalized.includes("advanced") || normalized.includes("hard")) return 4;
  if (normalized.includes("pro") || normalized.includes("race")) return 5;
  return 3;
}

function getInstallTimeLabel(value: string | null) {
  const normalized = value?.toLowerCase() || "";
  if (normalized.includes("diy")) return "DIY dependent";
  if (normalized.includes("shop")) return "Shop recommended";
  if (normalized.includes("pro")) return "Professional install";
  return "Not captured";
}

function getTuningLabel(categorySlug: string) {
  if (categorySlug === "ecu-tuning" || categorySlug === "forced-induction" || categorySlug === "ecu-electronics" || categorySlug === "performance-packages") return "Recommended";
  if (categorySlug === "exhaust" || categorySlug === "intake" || categorySlug === "exhaust-emissions" || categorySlug === "air-induction") return "Verify";
  return "Not usually required";
}

function getStatusTone(value: string | null) {
  if (value === "SOURCE_VERIFIED") return "is-verified";
  if (value === "ADMIN_TEST") return "is-test";
  return "is-review";
}

function formatDate(value: Date | null) {
  if (!value) return "Not checked";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function inferMaterial(part: { name: string; description: string | null; notes: string | null }) {
  const text = `${part.name} ${part.description || ""} ${part.notes || ""}`.toLowerCase();
  if (text.includes("carbon")) return "Carbon fiber";
  if (text.includes("titanium")) return "Titanium";
  if (text.includes("aluminum") || text.includes("aluminium")) return "Aluminum";
  if (text.includes("stainless")) return "Stainless steel";
  return "Source pending";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function isPresent(value: string | null | undefined): value is string {
  return Boolean(value);
}
