/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Image from "next/image";
import type { Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toggleGarageItem } from "@/app/actions/garage";
import { getMarketSummary } from "@/lib/market-intelligence";
import { isNonVehicleImageUrl } from "@/lib/vehicle-images";
import MarketPriceHistory from "@/components/market/MarketPriceHistory";
import { isListingMatchForModel } from "@/lib/inventory/validate-listing-identity";
import { getPartDetailPath } from "@/lib/parts/routes";



type ModelImageRecord = {
  id?: string;
  url: string;
  type: string | null;
  source: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  license?: string | null;
  attribution?: string | null;
  attributionUrl?: string | null;
  confidence?: number | null;
  reviewStatus?: string | null;
};

function getHeroImage(images: ModelImageRecord[]) {
  const displayableImages = images.filter(
    (image) => image.reviewStatus !== "NEEDS_REVIEW" && image.type?.toLowerCase() !== "candidate",
  );
  return displayableImages.find((image) => image.type?.toLowerCase() === "hero") ?? displayableImages[0] ?? null;
}

function getDisplayableModelImages(images: ModelImageRecord[]) {
  return images.filter(
    (image) => image.reviewStatus !== "NEEDS_REVIEW" && image.type?.toLowerCase() !== "candidate",
  );
}

function getListingImage(listing: ModelListingPreview) {
  if (listing.imageUrl && !isNonVehicleImageUrl(listing.imageUrl)) return listing.imageUrl;
  return "/images/placeholder.jpg";
}

type ModelPageProps = {
  params: Promise<{
    slug: string;
    modelSlug: string;
  }>;
};

function formatYears(startYear: number | null, endYear: number | null) {
  if (!startYear) {
    return null;
  }

  return endYear ? `${startYear} - ${endYear}` : `${startYear} - present`;
}

function formatCount(count: number | null) {
  if (!count) {
    return null;
  }

  return count.toLocaleString();
}

function formatMaintenanceInterval(intervalMiles: number | null, intervalMonths: number | null) {
  const parts = [
    intervalMiles ? `${intervalMiles.toLocaleString()} mi` : null,
    intervalMonths ? `${intervalMonths.toLocaleString()} mo` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "As needed";
}

function formatPartPrice(value: number | null) {
  if (value === null) return "Price pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function ModelEmptyState({
  title,
  detail,
  actionHref,
  actionLabel,
}: {
  title: string;
  detail: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="model-intelligence-empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
      <Link href={actionHref}>{actionLabel}</Link>
    </div>
  );
}

const modelPageSelect = {
  id: true,
  makeId: true,
  name: true,
  slug: true,
  years: true,
  productionStartYear: true,
  productionEndYear: true,
  category: true,
  bodyStyle: true,
  productionCount: true,
  description: true,
  metadataStatus: true,
  metadataSource: true,
  metadataSourceUrl: true,
  make: {
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
    },
  },
  spec: {
    select: {
      engine: true,
      displacement: true,
      cylinders: true,
      horsepower: true,
      torque: true,
      transmission: true,
      drivetrain: true,
      topSpeed: true,
      zeroToSixty: true,
      weight: true,
    },
  },
  variants: {
    select: {
      id: true,
      name: true,
      productionStartYear: true,
      productionEndYear: true,
      productionCount: true,
      description: true,
    },
    orderBy: [{ productionStartYear: "asc" }, { name: "asc" }],
    take: 24,
  },
  images: {
    select: {
      id: true,
      url: true,
      type: true,
      source: true,
      sourceUrl: true,
      sourceName: true,
      license: true,
      attribution: true,
      attributionUrl: true,
      confidence: true,
      reviewStatus: true,
    },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    take: 12,
  },
} satisfies Prisma.ModelSelect;

type ModelListingPreview = Prisma.ListingGetPayload<{
  select: typeof modelListingPreviewSelect;
}>;

const modelListingPreviewSelect = {
  id: true,
  dealerName: true,
  askingPrice: true,
  price: true,
  mileage: true,
  url: true,
  imageUrl: true,
  createdAt: true,
  validationStatus: true,
  source: {
    select: {
      name: true,
    },
  },
  vehicle: {
    select: {
      vin: true,
      year: true,
      vinIdentityStatus: true,
      model: {
        select: {
          name: true,
          make: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ListingSelect;

type ModelPageSession = Session | null;

export default async function ModelPage({ params }: ModelPageProps) {
  const { slug, modelSlug } = await params;
  const mockSession = (globalThis as typeof globalThis & { mockSession?: ModelPageSession }).mockSession;
  const [session, model] = await Promise.all([
    mockSession !== undefined ? Promise.resolve(mockSession) : auth(),
    prisma.model.findFirst({
      where: {
        slug: modelSlug,
        make: { slug },
      },
      select: modelPageSelect,
    }),
  ]);

  if (!model) {
    const makeExists = await prisma.make.findUnique({
      where: { slug },
      select: { id: true },
    });

    return (
      <main className="garage-page-shell auth-page-shell">
        <section className="auth-panel">
          <div className="garage-page-eyebrow">Explore</div>
          <h1>{makeExists ? "Model not found" : "Make not found"}</h1>
          <p>
            {makeExists
              ? "This model is not available in SUPERCAR DASH yet."
              : "This manufacturer is not available in SUPERCAR DASH yet."}
          </p>
        </section>
      </main>
    );
  }

  const [market, rawListings, maintenanceRules, recommendedParts, garageItem, claimedVehicle] = await Promise.all([
    getMarketSummary(model.id),
    // Public model inventory preview follows the same source-backed trust rules as market pages.
    prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        modelId: model.id,
        vehicleId: { not: null },
        sourceId: { not: null },
        externalListingId: { not: null },
        url: { not: null },
        sellerId: null,
        vehicle: {
          is: {
            // ACTIVE covers older VIN-backed rows created before the VALID/WARNING quality pass existed.
            // VALID and WARNING are safe to display publicly.
            // NEEDS_REVIEW = confirmed identity conflict, hidden from public pages.
            // REMOVED = duplicate/invalid VIN, permanently hidden.
            inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
          }
        },
        validationStatus: "VALID",
        priceStatus: { not: "PRICE_INVALID" },
        OR: [
          { askingPrice: { gte: 10000 } },
          { price: { gte: 10000 } }
        ],
        NOT: [
          { source: { is: { type: "AUCTION" } } },
          { url: { contains: "bringatrailer.com", mode: "insensitive" } },
          { externalListingId: { contains: "sprint-", mode: "insensitive" } },
          { externalListingId: { contains: "admin-ops", mode: "insensitive" } },
          { externalListingId: { contains: "demo", mode: "insensitive" } },
          { externalListingId: { contains: "test", mode: "insensitive" } },
        ]
      },
      select: modelListingPreviewSelect,
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.maintenanceRule.findMany({
      where: {
        OR: [
          { modelId: null },
          { modelId: model.id },
        ],
      },
      orderBy: [
        { priority: "asc" },
        { intervalMiles: "asc" },
      ],
      take: 6,
    }),
    prisma.performancePart.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { compatibility: { none: {} } },
          {
            compatibility: {
              some: {
                AND: [
                  {
                    OR: [
                      { makeId: null },
                      { makeId: model.makeId },
                    ],
                  },
                  {
                    OR: [
                      { modelId: null },
                      { modelId: model.id },
                    ],
                  },
                  {
                    OR: [
                      { yearStart: null },
                      { yearStart: { lte: model.productionEndYear ?? model.productionStartYear ?? 9999 } },
                    ],
                  },
                  {
                    OR: [
                      { yearEnd: null },
                      { yearEnd: { gte: model.productionStartYear ?? model.productionEndYear ?? 0 } },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrl: true,
        retailPriceCents: true,
        category: {
          select: {
            name: true,
          },
        },
        brand: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
      orderBy: [
        { category: { displayOrder: "asc" } },
        { brand: { name: "asc" } },
        { name: "asc" },
      ],
      take: 4,
    }),
    session?.user
      ? prisma.garageItem.findUnique({
          where: {
            userId_modelId: {
              userId: session.user.id,
              modelId: model.id,
            },
          },
          select: { id: true },
        })
      : null,
    session?.user
      ? prisma.vehicle.findFirst({
          where: {
            modelId: model.id,
            ownerId: session.user.id,
          },
          select: { vin: true },
        })
      : null,
  ]);

  // Validate and filter listings to ensure they match current make and model
  const validListings = rawListings.filter((l) => isListingMatchForModel(l, model));

  // Group active listings by vehicle VIN and choose the newest + lowest price
  const groups = new Map<string, ModelListingPreview[]>();
  for (const l of validListings) {
    const vin = l.vehicle?.vin;
    if (!vin) continue;
    if (!groups.has(vin)) {
      groups.set(vin, []);
    }
    groups.get(vin)!.push(l);
  }

  const dedupedListings: ModelListingPreview[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      const priceA = a.askingPrice || a.price || Infinity;
      const priceB = b.askingPrice || b.price || Infinity;
      return priceA - priceB;
    });
    dedupedListings.push(list[0]);
  }

  const listings = dedupedListings.sort((a, b) => {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const displayableModelImages = getDisplayableModelImages(model.images);
  const heroImage = getHeroImage(model.images);
  const galleryImages = displayableModelImages
    .filter((image) => image.url !== heroImage?.url)
    .slice(0, 5);
  const heroImageCredit = heroImage
    ? heroImage.attribution || heroImage.sourceName || heroImage.source || null
    : null;
  const heroImageCreditUrl = heroImage?.attributionUrl || heroImage?.sourceUrl || null;

  const specs = [
    ["Engine", model.spec?.engine],
    ["Displacement", model.spec?.displacement],
    ["Cylinders", model.spec?.cylinders],
    ["Horsepower", model.spec?.horsepower],
    ["Torque", model.spec?.torque],
    ["Transmission", model.spec?.transmission],
    ["Drivetrain", model.spec?.drivetrain],
    ["Top speed", model.spec?.topSpeed],
    ["0-60 mph", model.spec?.zeroToSixty],
    ["Weight", model.spec?.weight],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const modelTitle = `${model.make.name} ${model.name}`;
  const inventoryHref = `/inventory?make=${encodeURIComponent(model.make.slug)}&model=${encodeURIComponent(model.slug)}`;
  const partsHref = `/parts?make=${encodeURIComponent(model.make.slug)}&model=${encodeURIComponent(model.slug)}`;
  const productionYears = formatYears(model.productionStartYear, model.productionEndYear);
  const metadataSourceLabel = model.metadataSource || model.metadataSourceUrl || heroImageCredit || null;
  const metadataSourceHref = model.metadataSourceUrl || heroImageCreditUrl || null;
  const modelPassportFields = [
    ["Make", model.make.name],
    ["Model", model.name],
    ["Production Years", productionYears],
    ["Category", model.category],
    ["Body Style", model.bodyStyle],
    ["Production Count", formatCount(model.productionCount)],
    ...specs,
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const heroMeta = [
    "Model Passport",
    model.category,
    model.bodyStyle,
  ].filter((value): value is string => Boolean(value));
  const displayListings = listings.filter((listing) => getListingImage(listing) !== "/images/placeholder.jpg");
  const displayMarketRange = market.range;
  const displayMarketRangeLabel = displayMarketRange
    ? `$${displayMarketRange.lowestPrice.toLocaleString()} - $${displayMarketRange.highestPrice.toLocaleString()}`
    : null;
  const marketHasDisplayData = Boolean(displayMarketRange || market.recentSales.salesCount > 0 || market.trend);
  const heroStats = [
    productionYears ? ["Production Years", productionYears] : null,
    ["Horsepower", model.spec?.horsepower],
    ["0-60 MPH", model.spec?.zeroToSixty],
    ["Top Speed", model.spec?.topSpeed],
    displayMarketRangeLabel ? ["Market Range", displayMarketRangeLabel] : null,
  ].filter((entry): entry is [string, string] => Boolean(entry?.[1]));
  const modelFamilyItems = [
    {
      id: model.id,
      name: model.name,
      years: productionYears,
      productionCount: model.productionCount,
      description: model.description,
      current: true,
    },
    ...model.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      years: formatYears(variant.productionStartYear, variant.productionEndYear),
      productionCount: variant.productionCount,
      description: variant.description,
      current: false,
    })),
  ];
  const previewListings = displayListings.slice(0, 6);
  const modelMaintenanceRules = [...maintenanceRules].sort((a, b) => {
    const priority: Record<string, number> = { REQUIRED: 1, RECOMMENDED: 2, INSPECT: 3 };
    const priorityDelta = (priority[a.priority] || 99) - (priority[b.priority] || 99);
    if (priorityDelta !== 0) return priorityDelta;
    return (a.intervalMiles || 0) - (b.intervalMiles || 0);
  });

  return (
    <main className="model-intelligence-shell">
      <section className="model-intelligence-hero">
        <div className="vehicle-intelligence-hero-shade" aria-hidden="true" />
        <div className="vehicle-intelligence-hero-copy model-intelligence-hero-copy">
          <Link className="vehicle-intelligence-kicker model-back-link" href={`/make/${model.make.slug}`}>
            All {model.make.name} Models
          </Link>
          <div className="model-intelligence-make-row">
            {model.make.logoUrl ? <img src={model.make.logoUrl} alt="" loading="lazy" /> : null}
            <span>{model.make.name}</span>
          </div>
          <h1>{modelTitle}</h1>
          <div className="vehicle-intelligence-meta">
            {heroMeta.map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
          {model.description ? <p>{model.description}</p> : null}
          {heroImageCredit ? (
            <small className="model-intelligence-image-credit">
              Image:{" "}
              {heroImageCreditUrl ? (
                <Link href={heroImageCreditUrl} target="_blank" rel="noreferrer">
                  {heroImageCredit}
                </Link>
              ) : (
                heroImageCredit
              )}
            </small>
          ) : null}
        </div>

        <div className="model-intelligence-hero-media">
          {heroImage ? (
            <Image
              src={heroImage.url}
              alt=""
              fill
              sizes="(max-width: 980px) 100vw, 70vw"
              style={{ objectFit: "cover" }}
              priority
              unoptimized
            />
          ) : (
            <div className="model-intelligence-hero-fallback">
              <strong>{model.make.name}</strong>
              <span>{model.name}</span>
            </div>
          )}
          {galleryImages.length > 0 ? (
            <div className="model-intelligence-image-strip" aria-label="Additional model images">
              {galleryImages.map((image, index) => {
                const sourceHref = image.attributionUrl || image.sourceUrl || null;
                const imageLabel = `${modelTitle} image ${index + 2}`;
                return sourceHref ? (
                  <Link key={image.id ?? image.url} href={sourceHref} target="_blank" rel="noreferrer" aria-label={`${imageLabel} source`}>
                    <img src={image.url} alt={imageLabel} loading="lazy" />
                  </Link>
                ) : (
                  <span key={image.id ?? image.url}>
                    <img src={image.url} alt={imageLabel} loading="lazy" />
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>

        <aside className="vehicle-intelligence-actions model-intelligence-actions" aria-label="Model actions">
          <form action={async () => {
            "use server";
            if (!session?.user?.id) {
              await signIn("google", { redirectTo: `/make/${slug}/${modelSlug}` });
              return;
            }
            await toggleGarageItem(model.id);
          }}>
              <button
                type="submit"
              >
                <span aria-hidden="true">♡</span>
                {session?.user?.id && garageItem ? "Remove Dream Car" : "Add to Dream Garage"}
              </button>
          </form>
          {claimedVehicle ? (
            <Link href={`/vehicle/${claimedVehicle.vin}`}><span aria-hidden="true">▣</span>View Passport</Link>
          ) : (
            <Link href={`/claim/${model.id}`}><span aria-hidden="true">▣</span>Claim This Car</Link>
          )}
          <Link href={inventoryHref}><span aria-hidden="true">⌁</span>View Inventory</Link>
          <Link href={partsHref}><span aria-hidden="true">⌘</span>View Parts</Link>
        </aside>
      </section>

      <section className="vehicle-intelligence-hero-stats model-intelligence-stat-strip" aria-label="Model stats">
        {heroStats.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="vehicle-intelligence-dashboard model-intelligence-dashboard">
        <div className="vehicle-intelligence-main-column">
          {model.description ? (
            <section className="vehicle-intelligence-card model-intelligence-history-card">
              <div className="vehicle-intelligence-card-heading">
                <span>History</span>
                <strong>{model.make.name}</strong>
              </div>
              <p>{model.description}</p>
            </section>
          ) : null}

          <section className="vehicle-intelligence-card model-intelligence-variants-card">
            <div className="vehicle-intelligence-card-heading">
              <span>Model Family</span>
              <strong>{modelFamilyItems.length.toLocaleString()} cataloged</strong>
            </div>
            <div className="model-intelligence-family-track" aria-label={`${modelTitle} family timeline`}>
              {modelFamilyItems.map((item, index) => (
                <article key={item.id} className={item.current ? "is-current" : undefined}>
                  <div>
                    <span>{item.current ? "Current View" : `Variant ${index}`}</span>
                    <strong>{item.name}</strong>
                  </div>
                  {item.years || item.productionCount ? (
                    <dl>
                      {item.years ? (
                        <div>
                          <dt>Years</dt>
                          <dd>{item.years}</dd>
                        </div>
                      ) : null}
                      {item.productionCount ? (
                        <div>
                          <dt>Production</dt>
                          <dd>{item.productionCount.toLocaleString()}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                  {item.description ? <p>{item.description}</p> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="vehicle-intelligence-card vehicle-intelligence-passport-card">
            <div className="vehicle-intelligence-card-heading">
              <span>Model Passport</span>
              <strong>{model.metadataStatus === "REVIEWED" ? "Reviewed" : "Cataloged"}</strong>
            </div>
            {model.make.logoUrl ? <img className="vehicle-intelligence-passport-watermark" src={model.make.logoUrl} alt="" loading="lazy" /> : null}
            <div className="vehicle-intelligence-spec-grid vehicle-intelligence-passport-specs">
              {modelPassportFields.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {metadataSourceLabel ? (
              <div className="model-intelligence-source-note">
                <span>Model Data Source</span>
                {metadataSourceHref ? (
                  <Link href={metadataSourceHref} target="_blank" rel="noreferrer">
                    {metadataSourceLabel}
                  </Link>
                ) : (
                  <strong>{metadataSourceLabel}</strong>
                )}
              </div>
            ) : null}
          </section>

          <section className="vehicle-intelligence-card vehicle-intelligence-market-card model-intelligence-market-card">
            <div className="vehicle-intelligence-card-heading">
              <span>Market Intelligence</span>
              <strong>{marketHasDisplayData ? "Source Backed" : "Pending"}</strong>
            </div>
            {marketHasDisplayData ? (
              <>
                <div className="vehicle-intelligence-mini-stats">
                  {displayMarketRange ? (
                    <>
                      <article>
                        <span>Market Range</span>
                        <strong>{displayMarketRangeLabel}</strong>
                      </article>
                      <article>
                        <span>Average Asking</span>
                        <strong>${displayMarketRange.averageAskingPrice.toLocaleString()}</strong>
                      </article>
                    </>
                  ) : null}
                  <article>
                    <span>Active Listings</span>
                    <Link href={inventoryHref}>
                      <strong>{market.supply.activeListingCount.toLocaleString()}</strong>
                    </Link>
                  </article>
                  <article>
                    <span>Recent Sales</span>
                    <strong>{market.recentSales.salesCount.toLocaleString()}</strong>
                  </article>
                </div>
                <div className="vehicle-intelligence-market-chart model-intelligence-market-chart">
                  <MarketPriceHistory modelId={model.id} compact />
                </div>
                <div className="vehicle-intelligence-source-row" aria-label="Market data sources">
                  <span>Known Listings</span>
                  <span>Sold Comps</span>
                  <span>Price Trend</span>
                </div>
              </>
            ) : (
              <ModelEmptyState
                title="Market data is building"
                detail="SUPERCAR DASH needs source-backed listings or sold comps before this model gets a market range."
                actionHref={inventoryHref}
                actionLabel="Check Inventory"
              />
            )}
          </section>

          <section className="vehicle-intelligence-card model-intelligence-inventory-card">
            <div className="vehicle-intelligence-card-heading">
              <span>Available Inventory</span>
              <Link href={inventoryHref}>View Inventory</Link>
            </div>
            {previewListings.length === 0 ? (
              <ModelEmptyState
                title="No live inventory"
                detail="Only VIN-backed listings with price, image, and source identity are shown here."
                actionHref={inventoryHref}
                actionLabel="Search Inventory"
              />
            ) : (
              <div className="inventory-card-grid model-intelligence-inventory-grid">
                {previewListings.map((lst) => {
                  const image = getListingImage(lst);
                  const price = lst.askingPrice || lst.price || null;
                  const sourceLabel = lst.dealerName || lst.source?.name || "Source backed";
                  const vehicleHref = `/vehicle/${lst.vehicle?.vin}`;
                  return (
                    <article key={lst.id} className="market-listing-card">
                      <div>
                        <Link className="market-listing-image" href={vehicleHref} aria-label={`View ${model.make.name} ${model.name}`}>
                          <Image
                            src={image}
                            alt={`${lst.vehicle?.year ?? ""} ${model.make.name} ${model.name}`.trim()}
                            fill
                            sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
                            unoptimized
                          />
                        </Link>
                        <div className="market-listing-body">
                          <div className="market-listing-meta-row">
                            <span className="market-sale-pill">For Sale</span>
                            {price !== null ? (
                              <span className="market-listing-price">${price.toLocaleString()}</span>
                            ) : null}
                          </div>
                          <h3>{lst.vehicle?.year ?? "Year"} {model.make.name} {model.name}</h3>
                          <div className="market-listing-detail">
                            {lst.mileage !== null ? `${lst.mileage.toLocaleString()} miles` : "Mileage unavailable"}
                          </div>
                          <div className="market-listing-detail">{sourceLabel}</div>
                        </div>
                      </div>
                      <div className="market-listing-actions">
                        {lst.url ? (
                          <Link href={lst.url} target="_blank" rel="noreferrer" className="market-source-link">
                            View original listing
                          </Link>
                        ) : null}
                        <Link href={vehicleHref} className="market-card-button">
                          View Vehicle
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="vehicle-intelligence-side-column">
          <section className="vehicle-intelligence-card model-intelligence-maintenance-card">
            <div className="vehicle-intelligence-card-heading">
              <span>Maintenance Intelligence</span>
              <strong>{modelMaintenanceRules.length > 0 ? `${modelMaintenanceRules.length} rules` : "Model Guide"}</strong>
            </div>
            {modelMaintenanceRules.length > 0 ? (
              <div className="model-intelligence-rule-list">
                {modelMaintenanceRules.slice(0, 4).map((rule) => (
                  <article key={rule.id}>
                    <strong>{rule.serviceName}</strong>
                    <span>{formatMaintenanceInterval(rule.intervalMiles, rule.intervalMonths)}</span>
                    {rule.description ? <small>{rule.description}</small> : null}
                  </article>
                ))}
              </div>
            ) : (
              <ModelEmptyState
                title="No model-specific rules yet"
                detail="Claim a VIN to personalize service timing, records, and shop routing for this model."
                actionHref={`/claim/${model.id}`}
                actionLabel="Claim This Car"
              />
            )}
          </section>

          <section className="vehicle-intelligence-card model-intelligence-parts-card">
            <div className="vehicle-intelligence-card-heading">
              <span>Recommended Parts</span>
              <Link href={partsHref}>View Parts</Link>
            </div>
            {recommendedParts.length > 0 ? (
              <div className="model-intelligence-part-list">
                {recommendedParts.map((part) => (
                  <Link key={part.id} href={getPartDetailPath(part)}>
                    {part.imageUrl ? <img src={part.imageUrl} alt="" loading="lazy" /> : <span>{part.category.name}</span>}
                    <div>
                      <small>{part.category.name} · {part.brand.name}</small>
                      <strong>{part.name}</strong>
                      <em>{formatPartPrice(part.retailPriceCents)}</em>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <ModelEmptyState
                title="Parts fitment is pending"
                detail="Open the parts store with this make and model selected to browse universal and compatible categories."
                actionHref={partsHref}
                actionLabel="View Parts Store"
              />
            )}
          </section>

        </aside>
      </section>

    </main>
  );
}
