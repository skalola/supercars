/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @next/next/no-img-element */
import Link from "next/link";
import Image from "next/image";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toggleGarageItem } from "@/app/actions/garage";
import { getMarketSummary } from "@/lib/market-intelligence";
import { getVehicleHeroImage, isNonVehicleImageUrl } from "@/lib/vehicle-images";
import MarketPriceHistory from "@/components/market/MarketPriceHistory";
import { isListingMatchForModel } from "@/lib/inventory/validate-listing-identity";
import { SUPPORTED_MAKES } from "@/lib/supported-makes";



function getHeroImage(images: Array<{ url: string; type: string | null; source: string | null }>) {
  return images.find((image) => image.type === "hero")?.url ?? images[0]?.url ?? null;
}

function getListingImage(listing: any) {
  const hasOwnerPhotos = listing.vehicle?.photos && listing.vehicle.photos.length > 0;
  if (!hasOwnerPhotos && listing.imageUrl && !isNonVehicleImageUrl(listing.imageUrl)) {
    return listing.imageUrl;
  }
  const vehicleHero = getVehicleHeroImage(listing.vehicle);
  if (vehicleHero && vehicleHero !== "/images/placeholder.jpg") return vehicleHero;
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
    return "Production years unavailable";
  }

  return endYear ? `${startYear} - ${endYear}` : `${startYear} - present`;
}

function formatCount(count: number | null) {
  if (!count) {
    return "Not published";
  }

  return count.toLocaleString();
}

type ModelDetail = {
  id: string;
  makeId: string;
  name: string;
  slug: string;
  years: string | null;
  productionStartYear: number | null;
  productionEndYear: number | null;
  category: string | null;
  bodyStyle: string | null;
  productionCount: number | null;
  description: string | null;
  make: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  };
  spec: {
    id: string;
    modelId: string;
    engine: string | null;
    displacement: string | null;
    cylinders: string | null;
    horsepower: string | null;
    torque: string | null;
    transmission: string | null;
    drivetrain: string | null;
    topSpeed: string | null;
    zeroToSixty: string | null;
    weight: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  variants: Array<{
    id: string;
    modelId: string;
    name: string;
    slug: string;
    productionStartYear: number | null;
    productionEndYear: number | null;
    productionCount: number | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  images: Array<{
    id: string;
    modelId: string;
    url: string;
    source: string | null;
    type: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  vehicles: Array<{
    id: string;
    vin: string;
    modelId: string;
    year: number;
    color: string | null;
    mileage: number | null;
    transmission: string | null;
    drivetrain: string | null;
    engine: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export default async function ModelPage({ params }: ModelPageProps) {
  const { slug, modelSlug } = await params;
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();

  const make = await prisma.make.findUnique({
    where: { slug },
  });

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

  const model = (await prisma.model.findUnique({
    where: {
      makeId_slug: {
        makeId: make.id,
        slug: modelSlug,
      },
    },
    include: {
      make: true,
      variants: {
        orderBy: [{ productionStartYear: "asc" }, { name: "asc" }],
      },
      images: {
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
      },
      vehicles: {
        orderBy: [{ year: "asc" }, { vin: "asc" }],
      },
    },
  })) as ModelDetail | null;

  if (!model) {
    return (
      <main className="garage-page-shell auth-page-shell">
        <section className="auth-panel">
          <div className="garage-page-eyebrow">Explore</div>
          <h1>Model not found</h1>
          <p>This model is not available in SUPERCAR DASH yet.</p>
        </section>
      </main>
    );
  }

  const [spec, modelImages, market, rawListings] = await Promise.all([
    prisma.modelSpec.findUnique({
      where: { modelId: model.id },
    }),
    prisma.modelImage.findMany({
      where: { modelId: model.id },
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    }),
    getMarketSummary(model.id),
    // This protects market intelligence from invalid source pricing.
    prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        modelId: model.id,
        vehicleId: { not: null },
        vehicle: {
          is: {
            // ACTIVE covers older VIN-backed rows created before the VALID/WARNING quality pass existed.
            // VALID and WARNING are safe to display publicly.
            // NEEDS_REVIEW = confirmed identity conflict, hidden from public pages.
            // REMOVED = duplicate/invalid VIN, permanently hidden.
            inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
            model: {
              make: {
                name: { in: [...SUPPORTED_MAKES] },
              },
            },
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
        ]
      },
      include: {
        vehicle: {
          include: {
            photos: {
              orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }]
            },
            images: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
            },
            model: {
              include: {
                images: true,
                make: true,
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  // Validate and filter listings to ensure they match current make and model
  const validListings = rawListings.filter((l) => isListingMatchForModel(l, model));

  // Group active listings by vehicle VIN and choose the newest + lowest price
  const groups = new Map<string, any[]>();
  for (const l of validListings) {
    const vin = l.vehicle?.vin;
    if (!vin) continue;
    if (!groups.has(vin)) {
      groups.set(vin, []);
    }
    groups.get(vin)!.push(l);
  }

  const dedupedListings: any[] = [];
  for (const [vin, list] of groups.entries()) {
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

  // Snapshots for the sparkline chart (separate query — needed as array with date)
  const marketSnapshots = market.hasData
    ? await prisma.marketSnapshot.findMany({
        where: { modelId: model.id },
        orderBy: { date: "asc" },
        take: 12,
      })
    : [];

  const garageItem = session?.user ? await prisma.garageItem.findUnique({
    where: {
      userId_modelId: {
        userId: session.user.id as string,
        modelId: model.id,
      },
    },
  }) : null;

  const claimedVehicle = session?.user ? await prisma.vehicle.findFirst({
    where: {
      modelId: model.id,
      ownerId: session.user.id as string,
    },
  }) : null;

  const heroImage = getHeroImage(modelImages);

  const specs = [
    ["Engine", spec?.engine],
    ["Displacement", spec?.displacement],
    ["Cylinders", spec?.cylinders],
    ["Horsepower", spec?.horsepower],
    ["Torque", spec?.torque],
    ["Transmission", spec?.transmission],
    ["Drivetrain", spec?.drivetrain],
    ["Top speed", spec?.topSpeed],
    ["0-60 mph", spec?.zeroToSixty],
    ["Weight", spec?.weight],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <main className="garage-page-shell model-detail-shell">
      <Link
        className="model-back-link"
        href={`/make/${model.make.slug}`}
      >
        {model.make.name}
      </Link>

      <h1 className="model-detail-title">{model.name}</h1>

      <div style={{ marginTop: 20, display: "grid", gap: 20 }}>
        {heroImage ? (
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              background: "rgba(255, 255, 255, 0.06)",
            }}
          >
            <Image
              src={heroImage}
              alt={`${model.make.name} ${model.name}`}
              fill
              sizes="(max-width: 768px) 100vw, 75vw"
              style={{ objectFit: "cover" }}
              priority
              unoptimized
            />
            <form action={async () => {
              "use server";
              if (!session?.user?.id) {
                await signIn("google", { redirectTo: `/make/${slug}/${modelSlug}` });
                return;
              }
              await toggleGarageItem(model.id);
            }} style={{ position: "absolute", top: 12, right: 12 }}>
              <button
                type="submit"
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 12px",
                  cursor: "pointer",
                  background: "#e20f1b",
                  color: "#ffffff",
                  fontWeight: 700,
                }}
              >
                {session?.user?.id && garageItem ? "Remove from My Garage" : "Add to My Garage"}
              </button>
            </form>
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: 8,
              border: "1px solid rgba(255, 255, 255, 0.12)",
              background: "linear-gradient(135deg, #0f172a, #1d4ed8)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              textAlign: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{model.make.name}</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>{model.name}</div>
              <div style={{ marginTop: 10, color: "#cbd5e1" }}>Placeholder image coming soon</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, padding: 20, border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 8, background: "rgba(255, 255, 255, 0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, color: "rgba(255, 255, 255, 0.62)", fontWeight: 600 }}>Ownership</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {claimedVehicle ? (
                <span style={{ color: claimedVehicle.status === "CLAIMED" ? "#059669" : "#d97706" }}>
                  {claimedVehicle.status === "CLAIMED" ? "CLAIMED" : "CLAIM PENDING"}
                </span>
              ) : garageItem ? (
                <span style={{ color: "rgba(255, 255, 255, 0.62)" }}>In My Garage</span>
              ) : (
                "Not Claimed"
              )}
            </div>
            {claimedVehicle && (
              <div style={{ marginTop: 8 }}>
                <Link 
                  href={`/vehicle/${claimedVehicle.vin}`}
                  style={{ 
                    display: "inline-block",
                    padding: "6px 12px", 
                    background: "#e20f1b", 
                    color: "#fff", 
                    borderRadius: 8, 
                    textDecoration: "none", 
                    fontSize: 13, 
                    fontWeight: 600 
                  }}
                >
                  View Vehicle Passport &rarr;
                </Link>
              </div>
            )}
          </div>
          {session?.user && garageItem && !claimedVehicle && (
            <Link 
              href={`/claim/${model.id}`}
              style={{ 
                padding: "8px 16px", 
                background: "#e20f1b", 
                color: "#fff", 
                borderRadius: 8, 
                textDecoration: "none", 
                fontSize: 14, 
                fontWeight: 600 
              }}
            >
              Claim This Vehicle
            </Link>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginTop: 28,
        }}

      >
        <div>
          <div style={{ color: "rgba(255, 255, 255, 0.58)", fontSize: 13 }}>Production years</div>
          <strong>
            {formatYears(model.productionStartYear, model.productionEndYear)}
          </strong>
        </div>
        <div>
          <div style={{ color: "rgba(255, 255, 255, 0.58)", fontSize: 13 }}>Category</div>
          <strong>{model.category ?? "Uncategorized"}</strong>
        </div>
        <div>
          <div style={{ color: "rgba(255, 255, 255, 0.58)", fontSize: 13 }}>Body style</div>
          <strong>{model.bodyStyle ?? "Unavailable"}</strong>
        </div>
        <div>
          <div style={{ color: "rgba(255, 255, 255, 0.58)", fontSize: 13 }}>Production count</div>
          <strong>{formatCount(model.productionCount)}</strong>
        </div>
      </div>

      {model.description ? (
        <section style={{ marginTop: 36 }}>
          <h2>History</h2>
          <p style={{ color: "rgba(255, 255, 255, 0.78)", fontSize: 18, lineHeight: 1.65 }}>
            {model.description}
          </p>
        </section>
      ) : null}

      {model.variants.length > 0 ? (
        <section style={{ marginTop: 36 }}>
          <h2>Variants</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {model.variants.map((variant) => (
              <div
                key={variant.id}
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <h3 style={{ margin: "0 0 8px" }}>{variant.name}</h3>
                <div style={{ color: "rgba(255, 255, 255, 0.58)", fontSize: 13 }}>
                  {formatYears(
                    variant.productionStartYear,
                    variant.productionEndYear,
                  )}
                </div>
                {variant.productionCount ? (
                  <div style={{ color: "rgba(255, 255, 255, 0.58)", fontSize: 13, marginTop: 4 }}>
                    {variant.productionCount.toLocaleString()} built
                  </div>
                ) : null}
                {variant.description ? (
                  <p style={{ color: "rgba(255, 255, 255, 0.78)", lineHeight: 1.5 }}>
                    {variant.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {specs.length > 0 ? (
        <section style={{ marginTop: 36 }}>
          <h2>Performance specifications</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {specs.map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: 8,
                  padding: 16,
                }}
              >
                <div style={{ color: "rgba(255, 255, 255, 0.58)", fontSize: 13 }}>{label}</div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 24, marginBottom: 20 }}>Market Intelligence</h2>

        {market.hasData ? (
          <>
            {/* Stat Cards */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 28,
            }}>
              {/* Market Range */}
              {market.range && (
                <div style={{ border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 8, padding: 16, background: "rgba(255, 255, 255, 0.06)" }}>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.58)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Market Range</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#ffffff" }}>
                    ${market.range.lowestPrice.toLocaleString()} &ndash; ${market.range.highestPrice.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", marginTop: 4 }}>Active listings</div>
                </div>
              )}

              {/* Avg Asking */}
              {market.range && (
                <div style={{ border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 8, padding: 16, background: "rgba(255, 255, 255, 0.06)" }}>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.58)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Avg Asking Price</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#ffffff" }}>${market.range.averageAskingPrice.toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", marginTop: 4 }}>Median ${market.range.medianAskingPrice.toLocaleString()}</div>
                </div>
              )}

              {/* Supply */}
              <div style={{ border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 8, padding: 16, background: "rgba(255, 255, 255, 0.06)" }}>
                <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.58)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Active Listings</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#ffffff" }}>{market.supply.activeListingCount}</div>
                <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", marginTop: 4 }}>Currently on market</div>
              </div>

              {/* Recent Sales */}
              <div style={{ border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 8, padding: 16, background: "rgba(255, 255, 255, 0.06)" }}>
                <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.58)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Recent Sales</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#ffffff" }}>{market.recentSales.salesCount}</div>
                <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", marginTop: 4 }}>Last {market.recentSales.periodDays} days</div>
              </div>

              {/* Asking vs Sold */}
              {market.askingVsSold.differencePercent !== null && (
                <div style={{ border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 8, padding: 16, background: "rgba(255, 255, 255, 0.06)" }}>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.58)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Asking vs Sold</div>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: market.askingVsSold.differencePercent < 0 ? "#059669" : "#dc2626",
                  }}>
                    {market.askingVsSold.differencePercent > 0 ? "+" : ""}{market.askingVsSold.differencePercent}%
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", marginTop: 4 }}>Sold vs asking</div>
                </div>
              )}

            </div>
          </>
        ) : (
          <div style={{ border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 8, padding: 20, background: "rgba(255, 255, 255, 0.06)" }}>
            <div style={{ fontSize: 16, color: "rgba(255, 255, 255, 0.66)", fontStyle: "italic", marginBottom: 12 }}>
              No market data available yet.
            </div>
            <div style={{ fontSize: 13, color: "rgba(255, 255, 255, 0.66)", marginTop: 12, borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: 12 }}>
              <strong>Monitored Sources:</strong> Bring a Trailer, RM Sotheby&apos;s, DuPont Registry, and supported dealer networks
            </div>
            <div style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", marginTop: 4 }}>
              Status: Active monitoring in progress. Data is updated daily as auctions close and dealer inventories refresh.
            </div>
          </div>
        )}
      </section>

      <MarketPriceHistory modelId={model.id} />

      {/* Available Inventory Section */}
      <section style={{ marginTop: 40, marginBottom: 40 }}>
        <h2 style={{ fontSize: 24, marginBottom: 20 }}>Available Inventory</h2>
        {listings.length === 0 ? (
          <p style={{ color: "rgba(255, 255, 255, 0.58)", fontStyle: "italic" }}>No active listings for this model currently available.</p>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 20
          }}>
            {listings.map((lst) => {
              const image = getListingImage(lst);
              const price = lst.askingPrice || lst.price || null;
              return (
                <div
                  key={lst.id}
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 8,
                    overflow: "hidden",
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    {image ? (
                      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", backgroundColor: "rgba(255, 255, 255, 0.08)" }}>
                        <img
                          src={image}
                          alt={`${lst.vehicle?.year ?? "Year"} ${lst.vehicle?.model?.make?.name ?? "Make"} ${lst.vehicle?.model?.name ?? "Model"}`}
                          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        width: "100%",
                        paddingTop: "56.25%",
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "rgba(255, 255, 255, 0.5)",
                        fontSize: "14px",
                        position: "relative"
                      }}>
                        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
                          No Image
                        </div>
                      </div>
                    )}
                    <div style={{ padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                        <span style={{
                          backgroundColor: "#fef3c7",
                          color: "#d97706",
                          fontSize: "11px",
                          fontWeight: "bold",
                          padding: "2px 6px",
                          borderRadius: 4,
                          textTransform: "uppercase"
                        }}>
                          FOR SALE
                        </span>
                        {price !== null && (
                          <span style={{ fontWeight: 800, color: "#10b981", fontSize: "16px" }}>
                            ${price.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px 0", color: "#ffffff" }}>
                        {lst.vehicle?.year ?? "Year"} {lst.vehicle?.model?.make?.name ?? "Make"} {lst.vehicle?.model?.name ?? "Model"}
                      </h3>
                      <div style={{ fontSize: 13, color: "rgba(255, 255, 255, 0.58)" }}>
                        {lst.mileage !== null ? `${lst.mileage.toLocaleString()} miles` : "Mileage unavailable"}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 16, paddingTop: 0 }}>
                    <Link
                      href={`/vehicle/${lst.vehicle?.vin}`}
                      style={{
                        display: "block",
                        textAlign: "center",
                        backgroundColor: "#e20f1b",
                        color: "#ffffff",
                        padding: "10px 16px",
                        borderRadius: 8,
                        fontSize: "14px",
                        fontWeight: 600,
                        textDecoration: "none",
                        transition: "background-color 0.2s"
                      }}
                    >
                      View Vehicle
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </main>
  );
}
