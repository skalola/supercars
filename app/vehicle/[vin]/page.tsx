/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getMarketSummary } from "@/lib/market-intelligence";
import MarketPriceHistory from "@/components/market/MarketPriceHistory";
import PurchaseWizard from "@/components/market/PurchaseWizard";
import OwnerSaleControls from "@/components/market/OwnerSaleControls";
import type { VehicleGalleryImage } from "@/components/market/VehiclePhotoGallery";
import { AddToFavoritesButton } from "@/components/garage/AddToFavoritesButton";
import { getVehicleHeroImage, isNonVehicleImageUrl } from "@/lib/vehicle-images";
import { calculateModifiedPerformance } from "@/lib/parts/performance";
import { getPartDetailPath } from "@/lib/parts/routes";
import { getExplicitPartCompatibilityWhereForVehicle } from "@/lib/parts/compatibility";
import { auditPerformancePartTrust } from "@/lib/parts/trust";
import ServiceBookingActionButton from "./ServiceBookingActionButton";
import ServiceBookingModule from "./ServiceBookingModule";
import AddServiceRecordButton from "./AddServiceRecordButton";
import type { CSSProperties } from "react";

type VehiclePageProps = {
  params: Promise<{ vin: string }>;
  searchParams?: Promise<{ success?: string }>;
};

export default async function VehiclePage({ params, searchParams }: VehiclePageProps) {
  const { vin } = await params;
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
    include: {
      model: {
        include: {
          make: true,
          images: true,
          spec: true,
        },
      },
      images: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
      profile: true,
      modifications: {
        include: {
          catalogInstall: true,
        },
        orderBy: { createdAt: "desc" },
      },
      installedParts: {
        include: {
          part: {
            include: {
              category: true,
              brand: true,
            },
          },
          category: true,
        },
        orderBy: { createdAt: "desc" },
      },
      serviceRecords: {
        orderBy: { serviceDate: "desc" },
      },
      awards: {
        orderBy: { awardDate: "desc" },
      },
      photos: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      },
      documents: {
        orderBy: { createdAt: "desc" },
      },
      listings: {
        orderBy: { createdAt: "desc" },
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
            },
          },
        },
      },
      meetRsvps: {
        where: { status: { in: ["GOING", "MAYBE", "WAITLISTED"] } },
        include: {
          meet: {
            select: {
              slug: true,
              title: true,
              type: true,
              status: true,
              startsAt: true,
              city: true,
              state: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      },
      meetPhotos: {
        include: {
          meet: {
            select: {
              slug: true,
              title: true,
              status: true,
              startsAt: true,
              city: true,
              state: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });

  if (!vehicle || vehicle.inventoryStatus === "REMOVED" || vehicle.inventoryStatus === "NEEDS_REVIEW") {
    return (
      <main className="page-shell">
        <h1>Vehicle not found</h1>
      </main>
    );
  }

  const isAdmin = session?.user?.role === "ADMIN";
  if (vehicle.inventoryStatus === "ADMIN_TEST" && !isAdmin) {
    return (
      <main className="page-shell">
        <h1>Vehicle not found</h1>
      </main>
    );
  }

  const installedCatalogPartIds = new Set(
    (vehicle.installedParts || [])
      .map((installedPart: any) => installedPart.partId)
      .filter(Boolean)
  );

  const [maintenanceRules, market, savedFavorite, rawRecommendedParts, serviceShops] = await Promise.all([
    prisma.maintenanceRule.findMany({
      where: {
        OR: [
          { modelId: null },
          { modelId: vehicle.modelId }
        ]
      }
    }),
    getMarketSummary(vehicle.modelId),
    session?.user?.id
      ? prisma.garageItem.findUnique({
          where: {
            userId_modelId: {
              userId: session.user.id as string,
              modelId: vehicle.modelId,
            },
          },
          select: { id: true },
        })
      : null,
    prisma.performancePart.findMany({
      where: {
        status: "ACTIVE",
        id: installedCatalogPartIds.size > 0 ? { notIn: Array.from(installedCatalogPartIds) } : undefined,
        ...getExplicitPartCompatibilityWhereForVehicle(vehicle),
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
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [
        { category: { displayOrder: "asc" } },
        { brand: { name: "asc" } },
        { name: "asc" },
      ],
      take: 8,
    }),
    prisma.partnerContact.findMany({
      where: {
        type: "SERVICE_SHOP",
        active: true,
        email: { not: null },
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        email: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const performanceSummary = calculateModifiedPerformance({
    stockHorsepower: vehicle.engineHP || vehicle.model.spec?.horsepower,
    stockTorque: vehicle.model.spec?.torque,
    installedParts: vehicle.installedParts || [],
  });
  const recommendedParts = rawRecommendedParts.filter((part) => auditPerformancePartTrust(part).publicEligible);
  const unlinkedModifications = (vehicle.modifications || []).filter((mod: any) => !mod.catalogInstall);

  const priorityOrder: Record<string, number> = {
    REQUIRED: 1,
    RECOMMENDED: 2,
    INSPECT: 3
  };

  const sortedRules = [...maintenanceRules].sort((a, b) => {
    const pA = priorityOrder[a.priority] || 99;
    const pB = priorityOrder[b.priority] || 99;
    if (pA !== pB) return pA - pB;
    return (a.intervalMiles || 0) - (b.intervalMiles || 0);
  });

  // Check mileage in priority: 1. Vehicle.currentMileage, 2. Vehicle mileage decoded/imported data, 3. User-entered mileage
  const currentMileage = (vehicle as any).currentMileage ?? vehicle.mileage ?? vehicle.profile?.currentMileage ?? null;

  const { success: successParam } = (await searchParams) || {};
  const isAdminTestFixture = vehicle.inventoryStatus === "ADMIN_TEST";
  const isOwner = !!(
    (session?.user?.id && vehicle.ownerId === session.user.id && vehicle.status === "CLAIMED") ||
    (isAdmin && isAdminTestFixture)
  );
  let resolvedHeroImage = getVehicleHeroImage(vehicle);

  const activeListing = [...vehicle.listings]
    .filter((l) => {
      const price = l.askingPrice ?? l.price ?? 0;
      const isAdminTestListing = isAdmin && l.validationStatus === "ADMIN_TEST";
      return l.status === "ACTIVE" && (l.validationStatus === "VALID" || isAdminTestListing) && l.priceStatus !== "PRICE_INVALID" && price >= 10000;
    })
    .sort((a, b) => {
      if (Boolean(b.url) !== Boolean(a.url)) return Boolean(b.url) ? 1 : -1;
      const priceA = a.askingPrice ?? a.price ?? Infinity;
      const priceB = b.askingPrice ?? b.price ?? Infinity;
      if (priceA !== priceB) return priceA - priceB;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    })[0];
  
  const hasOwnerPhotos = vehicle.photos && vehicle.photos.length > 0;
  const validImportedVehicleImages = (vehicle.images || []).filter(
    (image: any) =>
      image.validationStatus !== "IMAGE_UNVERIFIED" &&
      image.validationStatus !== "IMAGE_MISMATCH" &&
      !isNonVehicleImageUrl(image.url) &&
      !isLikelyDetailHeroImage([image.url, image.alt].filter(Boolean).join(" "))
  );
  const modelHeroImage = getBestModelHeroImage(vehicle.model.images);
  if (!hasOwnerPhotos) {
    const primaryImportedHero = validImportedVehicleImages.find((image: any) => image.isPrimary)?.url || validImportedVehicleImages[0]?.url || null;
    if (validImportedVehicleImages.length >= 3 && primaryImportedHero) {
      resolvedHeroImage = primaryImportedHero;
    } else if (modelHeroImage) {
      resolvedHeroImage = modelHeroImage;
    } else if (activeListing?.imageUrl && !isLikelyDetailHeroImage(activeListing.imageUrl)) {
      resolvedHeroImage = activeListing.imageUrl;
    }
  }
  
  const isForSale = !!activeListing;
  const askingPrice = activeListing?.askingPrice || activeListing?.price || null;
  const localSeller = activeListing?.seller || null;
  const localSellerLabel = localSeller?.username || localSeller?.name || "SUPERCAR DASH owner";
  const localSellerHref = localSeller?.username ? `/garage/${localSeller.username}` : "/garage";
  const originalListingUrl = activeListing?.sellerId
    ? null
    : activeListing?.url || vehicle.listings.find((listing) => !listing.sellerId && listing.url)?.url || null;
  const matchingInventoryHref = `/inventory?make=${encodeURIComponent(vehicle.model.make.slug)}&model=${encodeURIComponent(vehicle.model.slug)}`;
  const matchingPartsHref = `/parts?make=${encodeURIComponent(vehicle.model.make.slug)}&model=${encodeURIComponent(vehicle.model.slug)}`;
  const galleryImages = buildVehicleGalleryImages(vehicle, resolvedHeroImage, activeListing?.imageUrl || null);
  const heroStyle = resolvedHeroImage
    ? ({ "--vehicle-passport-hero-image": `url("${resolvedHeroImage}")` } as CSSProperties)
    : undefined;
  const vehicleTitle = `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`;
  const primaryPassportFields = [
    ["VIN", vehicle.vin],
    ["Year", vehicle.year],
    ["Make", vehicle.model.make.name],
    ["Model", vehicle.model.name],
    ["Trim", vehicle.trim],
    ["Drivetrain", vehicle.drivetrain],
    ["Transmission", vehicle.transmission],
    ["Engine", vehicle.engine || vehicle.model.spec?.engine],
    ["Exterior Color", vehicle.profile?.exteriorColor || vehicle.color],
    ["Mileage", currentMileage !== null && currentMileage !== undefined ? `${currentMileage.toLocaleString()} mi` : null],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const firstMaintenanceRule = sortedRules[0] ?? null;
  const maintenanceSummary = getMaintenanceSummary(firstMaintenanceRule, currentMileage, vehicle.serviceRecords);
  const maintenanceHealth = getMaintenanceHealth(currentMileage, sortedRules, vehicle.serviceRecords);
  const serviceRecordCount = vehicle.serviceRecords?.length ?? 0;
  const installedPartCount = (vehicle.installedParts?.length ?? 0) + unlinkedModifications.length;
  const estimatedVehicleValue = market.range ? `$${market.range.averageAskingPrice.toLocaleString()}` : askingPrice ? `$${askingPrice.toLocaleString()}` : "Pending";
  const priceStatLabel = isForSale ? "List Price" : "Est. Value";
  const priceStatValue = isForSale && askingPrice ? `$${askingPrice.toLocaleString()}` : estimatedVehicleValue;
  const galleryPreviewImages = galleryImages.length >= 3 ? galleryImages.slice(0, 5) : [];
  const visibleServiceRecords = vehicle.serviceRecords.slice(0, 4);
  const hiddenServiceRecords = vehicle.serviceRecords.slice(4);

  return (
      <main className="vehicle-intelligence-shell">
        {isOwner ? (
          <ServiceBookingModule
            vin={vehicle.vin}
            makeName={vehicle.model.make.name}
            defaultRule={firstMaintenanceRule}
            serviceShops={serviceShops
              .filter((shop) => shop.email && shop.latitude !== null && shop.longitude !== null)
              .map((shop) => ({
                id: shop.id,
                name: shop.name,
                email: shop.email as string,
                city: shop.city,
                state: shop.state,
                latitude: shop.latitude as number,
                longitude: shop.longitude as number,
              }))}
          />
        ) : null}
        <section className="vehicle-intelligence-hero" style={heroStyle}>
          <div className="vehicle-intelligence-hero-shade" aria-hidden="true" />
          <div className="vehicle-intelligence-hero-copy">
            <span className="vehicle-intelligence-kicker">{isOwner ? "Claimed Garage" : isForSale ? "Market Listing" : "Vehicle Passport"}</span>
            <h1>{vehicleTitle}</h1>
            <div className="vehicle-intelligence-meta">
              {isForSale ? <span className="is-sale">For Sale</span> : null}
              <span>VIN {vehicle.vin}</span>
              {vehicle.status === "CLAIMED" ? <span className="is-verified">VIN Verified</span> : null}
              {vehicle.trim ? <span>{vehicle.trim}</span> : null}
            </div>
            <div className="vehicle-intelligence-hero-stats" aria-label="Vehicle hero stats">
              <article>
                <span>Mileage</span>
                <strong>{currentMileage !== null && currentMileage !== undefined ? currentMileage.toLocaleString() : "Pending"}{currentMileage !== null && currentMileage !== undefined ? <small> mi</small> : null}</strong>
              </article>
              <article>
                <span>Horsepower</span>
                <strong>{formatPerformanceMetric(performanceSummary.stockHorsepower, "hp")}</strong>
              </article>
              <article>
                <span>Torque</span>
                <strong>{formatPerformanceMetric(performanceSummary.stockTorque, "lb-ft")}</strong>
              </article>
              <article>
                <span>{priceStatLabel}</span>
                <strong>{priceStatValue}</strong>
              </article>
            </div>
            {galleryPreviewImages.length > 0 ? (
              <div className="vehicle-intelligence-thumbs" aria-label="Vehicle photo thumbnails">
                {galleryPreviewImages.map((image) => (
                  <img key={image.id} src={image.src} alt="" loading="lazy" />
                ))}
              </div>
            ) : null}
          </div>

          <aside className="vehicle-intelligence-actions" aria-label="Vehicle actions">
            {isOwner ? (
              <>
                <Link href={`/vehicle/${vehicle.vin}/edit`}><span aria-hidden="true">✎</span>Edit Passport</Link>
                <ServiceBookingActionButton vin={vehicle.vin} />
                <Link href={`/vehicle/${vehicle.vin}/edit`}><span aria-hidden="true">＋</span>Add Mod</Link>
                <Link href={matchingPartsHref}><span aria-hidden="true">⌘</span>View Parts</Link>
                <OwnerSaleControls vin={vin} isForSale={isForSale} askingPrice={askingPrice} />
              </>
            ) : isForSale && activeListing ? (
              <>
                <PurchaseWizard
                  vin={vehicle.vin}
                  year={vehicle.year}
                  make={vehicle.model.make.name}
                  model={vehicle.model.name}
                  askingPrice={askingPrice || 0}
                  mileage={vehicle.profile?.currentMileage || vehicle.mileage}
                  color={vehicle.profile?.exteriorColor || vehicle.color}
                  listingId={activeListing.id}
                  originalListingUrl={originalListingUrl}
                  listedByLabel={localSeller ? localSellerLabel : null}
                  listedByHref={localSeller ? localSellerHref : null}
                />
                <AddToFavoritesButton modelId={vehicle.modelId} initialSaved={Boolean(savedFavorite)} />
              </>
            ) : (
              <>
                <AddToFavoritesButton modelId={vehicle.modelId} initialSaved={Boolean(savedFavorite)} />
                <Link href={matchingPartsHref}>View Parts</Link>
              </>
            )}
          </aside>

        </section>

        {successParam === "listed" ? (
          <div className="vehicle-intelligence-alert">Vehicle successfully listed for sale.</div>
        ) : null}
        {successParam === "removed" ? (
          <div className="vehicle-intelligence-alert">Listing removed successfully.</div>
        ) : null}

        <section className="vehicle-intelligence-dashboard">
          <div className="vehicle-intelligence-main-column">
            <section className="vehicle-intelligence-card vehicle-intelligence-passport-card">
              <div className="vehicle-intelligence-card-heading">
                <span>Vehicle Passport</span>
                <strong>{vehicle.status === "CLAIMED" ? "Verified" : "Decoded"}</strong>
              </div>
              {vehicle.model.make.logoUrl ? (
                <img className="vehicle-intelligence-passport-watermark" src={vehicle.model.make.logoUrl} alt="" loading="lazy" />
              ) : null}
              <div className="vehicle-intelligence-spec-grid vehicle-intelligence-passport-specs">
                {primaryPassportFields.map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="vehicle-intelligence-card vehicle-intelligence-market-card">
              <div className="vehicle-intelligence-card-heading">
                <span>Market Intelligence</span>
                <strong>{market.hasData ? "Source Backed" : "Pending"}</strong>
              </div>
              {market.hasData ? (
                <>
                  <div className="vehicle-intelligence-mini-stats">
                    {market.range ? (
                      <>
                        <article>
                          <span>Average Asking</span>
                          <strong>${market.range.averageAskingPrice.toLocaleString()}</strong>
                        </article>
                        <article>
                          <span>Market Range</span>
                          <strong>${market.range.lowestPrice.toLocaleString()} - ${market.range.highestPrice.toLocaleString()}</strong>
                        </article>
                      </>
                    ) : null}
                    <article>
                      <span>Active Listings</span>
                      <Link href={matchingInventoryHref}>
                        <strong>{market.supply.activeListingCount.toLocaleString()}</strong>
                      </Link>
                    </article>
                    <article>
                      <span>Recent Sales</span>
                      <strong>{market.recentSales.salesCount.toLocaleString()}</strong>
                    </article>
                  </div>
                  <div className="vehicle-intelligence-market-chart">
                    <MarketPriceHistory modelId={vehicle.modelId} compact />
                  </div>
                  <div className="vehicle-intelligence-source-row" aria-label="Market data sources">
                    <span>Known Listings</span>
                    <span>Sold Comps</span>
                    <span>Price Trend</span>
                  </div>
                </>
              ) : (
                <p className="vehicle-intelligence-empty">No market data available yet.</p>
              )}
            </section>

            <section className="vehicle-intelligence-card vehicle-intelligence-service-card">
              <div className="vehicle-intelligence-card-heading">
                <span>Service Records</span>
                <div className="vehicle-intelligence-service-heading-actions">
                  <strong>{serviceRecordCount.toLocaleString()} record{serviceRecordCount === 1 ? "" : "s"}</strong>
                  {isOwner ? <AddServiceRecordButton vin={vehicle.vin} /> : null}
                </div>
              </div>
              <div className="vehicle-intelligence-record-list">
                <div className="vehicle-intelligence-record-header" aria-hidden="true">
                  <span>Date</span>
                  <span>Mileage</span>
                  <span>Shop</span>
                  <span>Description</span>
                  <span>Documents</span>
                </div>
                {serviceRecordCount > 0 ? (
                  <>
                  {visibleServiceRecords.map((record: any) => (
                    <article key={record.id}>
                      <time>{new Date(record.serviceDate).toLocaleDateString()}</time>
                      <span>{record.mileage ? `${record.mileage.toLocaleString()} mi` : "Mileage pending"}</span>
                      <span>{record.shopName || "Shop pending"}</span>
                      <strong>{record.description || "Service record"}</strong>
                      <span>{record.cost ? `$${record.cost.toLocaleString()}` : "Invoice"}</span>
                    </article>
                  ))}
                  {hiddenServiceRecords.length > 0 ? (
                    <details className="vehicle-intelligence-record-details">
                      <div className="vehicle-intelligence-record-extra">
                        {hiddenServiceRecords.map((record: any) => (
                          <article key={record.id}>
                            <time>{new Date(record.serviceDate).toLocaleDateString()}</time>
                            <span>{record.mileage ? `${record.mileage.toLocaleString()} mi` : "Mileage pending"}</span>
                            <span>{record.shopName || "Shop pending"}</span>
                            <strong>{record.description || "Service record"}</strong>
                            <span>{record.cost ? `$${record.cost.toLocaleString()}` : "Invoice"}</span>
                          </article>
                        ))}
                      </div>
                      <summary className="vehicle-intelligence-footer-link">
                        <span className="vehicle-intelligence-record-show">View All Records</span>
                        <span className="vehicle-intelligence-record-hide">Hide Records</span>
                      </summary>
                    </details>
                  ) : null}
                  </>
                ) : (
                  <p className="vehicle-intelligence-empty vehicle-intelligence-record-empty">No service records yet.</p>
                )}
              </div>
            </section>

          </div>

          <aside className="vehicle-intelligence-side-column">
            <section id="vehicle-maintenance" className="vehicle-intelligence-card vehicle-intelligence-maintenance-card">
              <div className="vehicle-intelligence-card-heading">
                <span>Maintenance Intelligence</span>
              </div>
              <div className={`vehicle-intelligence-health-row ${maintenanceHealth.tone === "pending" ? "is-pending-data" : ""}`}>
                <div>
                  <span>Next Recommended Service</span>
                  <strong>{firstMaintenanceRule?.serviceName ?? "Recommendations pending"}</strong>
                  <p>{firstMaintenanceRule?.description ?? (currentMileage === null || currentMileage === undefined ? "Add current mileage to personalize service timing." : "Service guidance is based on mileage and passport history.")}</p>
                  <div className="vehicle-intelligence-due-row">
                    <article>
                      <span>Due At</span>
                      <strong>{maintenanceSummary.dueAt}</strong>
                    </article>
                    <article>
                      <span>Or By</span>
                      <strong>{maintenanceSummary.orBy}</strong>
                    </article>
                  </div>
                </div>
                <div className="vehicle-intelligence-health-score">
                  <div className={`vehicle-intelligence-health-ring is-${maintenanceHealth.tone}`}>
                    <strong>{maintenanceHealth.score}</strong>
                    <span>/100</span>
                  </div>
                  <small>{maintenanceHealth.label}</small>
                </div>
                {maintenanceHealth.tone === "pending" ? (
                  <div className="vehicle-intelligence-checklist vehicle-intelligence-pending-state">
                    <strong>Awaiting records</strong>
                    <span>
                      <i aria-hidden="true">•</i>
                      <b>Add mileage</b>
                      <em>Needed</em>
                    </span>
                    <span>
                      <i aria-hidden="true">•</i>
                      <b>Log service</b>
                      <em>Pending</em>
                    </span>
                    <span>
                      <i aria-hidden="true">•</i>
                      <b>Upload docs</b>
                      <em>Optional</em>
                    </span>
                  </div>
                ) : (
                  <div className="vehicle-intelligence-checklist">
                    {maintenanceHealth.items.map((item) => (
                      <span key={item.label} className={item.status === "Good" ? "is-complete" : item.status === "Due" ? "is-due" : ""}>
                        <i aria-hidden="true">{item.status === "Good" ? "✓" : item.status === "Due" ? "!" : "•"}</i>
                        <b>{item.label}</b>
                        <em>{item.status}</em>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="vehicle-intelligence-card">
              <div className="vehicle-intelligence-card-heading">
                <span>Mod List / Build Sheet</span>
                <strong>{installedPartCount.toLocaleString()} logged</strong>
              </div>
              {installedPartCount > 0 ? (
                <div className="vehicle-intelligence-mod-list">
                  <div className="vehicle-intelligence-mod-header" aria-hidden="true">
                    <span>Category</span>
                    <span>Part / Brand</span>
                    <span>Cost / Installed</span>
                  </div>
                  {vehicle.installedParts.map((installedPart: any) => {
                    const label = installedPart.part?.name || installedPart.customName || "Owner-reported part";
                    const brand = installedPart.part?.brand?.name || installedPart.customBrandName;
                    const category = installedPart.part?.category?.name || installedPart.category?.name;

                    return (
                      <article key={installedPart.id}>
                        <span>{category || "Build"}</span>
                        <strong>{[brand, label].filter(Boolean).join(" · ")}</strong>
                        <small>{[installedPart.part?.retailPriceCents ? formatPartPrice(installedPart.part.retailPriceCents) : null, installedPart.installedDate || null].filter(Boolean).join(" · ") || "Pending"}</small>
                      </article>
                    );
                  })}
                  {unlinkedModifications.map((mod: any) => (
                    <article key={mod.id}>
                      <span>Manual</span>
                      <strong>{[mod.brand, mod.name].filter(Boolean).join(" · ")}</strong>
                      <small>{mod.installedDate || "Pending"}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="vehicle-intelligence-empty">No parts or modifications logged yet.</p>
              )}
            </section>

            <section className="vehicle-intelligence-card">
              <div className="vehicle-intelligence-card-heading">
                <span>Recommended Parts</span>
                <Link href="/parts">View Parts Store</Link>
              </div>
              {recommendedParts.length === 0 ? (
                <p className="vehicle-intelligence-empty">No compatible catalog upgrades are active yet for this model.</p>
              ) : (
                <div className="vehicle-intelligence-part-list">
                  {recommendedParts.slice(0, 3).map((part) => {
                    const fitment = part.compatibility.map(formatPartCompatibility).filter(Boolean);
                    const partDetailHref = getPartDetailPath(part);
                    return (
                      <article key={part.id}>
                        <Link href={partDetailHref} className="vehicle-intelligence-part-media" aria-label={`View ${part.name}`}>
                          {part.imageUrl ? <img src={part.imageUrl} alt="" loading="lazy" /> : <div className="vehicle-intelligence-part-placeholder">{part.category.name}</div>}
                        </Link>
                        <div>
                          <span>{part.category.name} · {part.brand.name}</span>
                          <strong>
                            <Link href={partDetailHref}>{part.name}</Link>
                          </strong>
                          <small>{[formatPartPrice(part.retailPriceCents), part.estimatedHpGain ? `+${part.estimatedHpGain.toLocaleString()} hp` : null, fitment[0]].filter(Boolean).join(" · ")}</small>
                          <Link href={partDetailHref}>View Part</Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>
        </section>
      </main>
    );
}

function buildVehicleGalleryImages(vehicle: any, resolvedHeroImage: string | null, activeListingImageUrl: string | null): VehicleGalleryImage[] {
  const seen = new Set<string>();
  const gallery: VehicleGalleryImage[] = [];

  const addImage = (input: { id: string; src?: string | null; alt: string; caption?: string | null }) => {
    const src = input.src?.trim();
    if (!src || seen.has(src)) return;
    seen.add(src);
    gallery.push({ id: input.id, src, alt: input.alt, caption: input.caption });
  };

  addImage({
    id: "resolved-hero",
    src: resolvedHeroImage,
    alt: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
  });

  for (const photo of vehicle.photos || []) {
    addImage({
      id: `owner-photo-${photo.id}`,
      src: photo.filePath,
      alt: photo.caption || `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
      caption: photo.caption,
    });
  }

  const validImportedImages = (vehicle.images || []).filter(
    (image: any) => image.validationStatus !== "IMAGE_UNVERIFIED" && image.validationStatus !== "IMAGE_MISMATCH" && !isNonVehicleImageUrl(image.url)
  );

  for (const image of validImportedImages) {
    addImage({
      id: `imported-image-${image.id}`,
      src: image.url,
      alt: image.alt || `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
    });
  }

  addImage({
    id: "active-listing-image",
    src: activeListingImageUrl,
    alt: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
  });

  return gallery;
}

function isLikelyDetailHeroImage(value: string | null | undefined) {
  if (!value) return false;
  return /interior|wheel|rim|tire|tyre|engine|seat|dashboard|steering|badge|emblem|logo|detail|close.?up|carfax|autocheck/i.test(value);
}

function getBestModelHeroImage(images: any[] | null | undefined) {
  if (!images || images.length === 0) return null;

  const scoredImages = images
    .filter((image) => image?.url && !isNonVehicleImageUrl(image.url))
    .map((image) => {
      const text = [image.url, image.type, image.sourceName, image.attribution].filter(Boolean).join(" ");
      let score = image.type === "hero" ? 40 : 0;
      if (/exterior|side|profile|three.?quarter|front|rear|studio|press|official|media/i.test(text)) score += 18;
      if (/flickr|wikimedia|wikipedia|manufacturer|official/i.test(text)) score += 8;
      if (isLikelyDetailHeroImage(text)) score -= 60;
      return { image, score };
    })
    .sort((a, b) => b.score - a.score);

  return scoredImages[0]?.image.url || null;
}

function getMaintenanceSummary(rule: any | null, currentMileage: number | null, serviceRecords: any[]) {
  if (!rule) return { dueAt: "Pending", orBy: "Pending" };
  if (currentMileage === null || currentMileage === undefined) return { dueAt: "Add mileage", orBy: "Pending" };

  if (rule.intervalMiles) {
    const records = serviceRecords.filter((record) => record.description?.startsWith(`[${rule.serviceName}]`));
    const lastCompletedMileage = records.reduce((max, record) => Math.max(max, record.mileage || 0), 0);
    let nextMilestone = Math.ceil(currentMileage / rule.intervalMiles) * rule.intervalMiles;
    while (nextMilestone <= lastCompletedMileage) nextMilestone += rule.intervalMiles;
    return {
      dueAt: `${nextMilestone.toLocaleString()} mi`,
      orBy: rule.intervalMonths ? `${rule.intervalMonths} mo` : "Mileage based",
    };
  }

  if (rule.intervalMonths) {
    return {
      dueAt: "Time based",
      orBy: `${rule.intervalMonths} mo`,
    };
  }

  return { dueAt: "Inspect", orBy: "As needed" };
}

function getMaintenanceHealth(currentMileage: number | null, sortedRules: any[], serviceRecords: any[]) {
  const systems = [
    { label: "Engine", keywords: ["oil", "engine", "spark", "belt"] },
    { label: "Transmission", keywords: ["transmission", "clutch", "gearbox"] },
    { label: "Brakes", keywords: ["brake", "rotor", "pad", "fluid"] },
    { label: "Fluids", keywords: ["fluid", "coolant", "oil"] },
    { label: "Tires", keywords: ["tire", "alignment", "rotation"] },
    { label: "Battery", keywords: ["battery", "electrical"] },
  ];

  const normalizedRecords = serviceRecords.map((record) =>
    [record.description, record.shopName].filter(Boolean).join(" ").toLowerCase()
  );
  const normalizedRules = sortedRules.map((rule) =>
    [rule.serviceName, rule.category, rule.description].filter(Boolean).join(" ").toLowerCase()
  );

  const items = systems.map((system) => {
    const hasRecord = normalizedRecords.some((record) => system.keywords.some((keyword) => record.includes(keyword)));
    const hasRule = normalizedRules.some((rule) => system.keywords.some((keyword) => rule.includes(keyword)));
    const status = hasRecord ? "Good" : hasRule && currentMileage !== null && currentMileage !== undefined ? "Due" : "Pending";
    return { label: system.label, status };
  });

  const completedWeight = items.reduce((score, item) => {
    if (item.status === "Good") return score + 1;
    if (item.status === "Due") return score + 0.55;
    return score + 0.25;
  }, 0);
  const score = Math.round((completedWeight / items.length) * 100);
  const knownCount = items.filter((item) => item.status !== "Pending").length;
  const tone = knownCount === 0 ? "pending" : score >= 80 ? "good" : score >= 55 ? "due" : "risk";
  const label = tone === "pending" ? "Data Pending" : score >= 90 ? "Excellent" : tone === "good" ? "Good" : tone === "due" ? "Due Soon" : "Needs Attention";

  return { score, items, tone, label };
}

function formatPartPrice(value: number | null) {
  if (value === null) return "Price pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function formatPartCompatibility(partCompatibility: {
  make: { name: string } | null;
  model: { name: string } | null;
  yearStart: number | null;
  yearEnd: number | null;
  trim: string | null;
  engine: string | null;
}) {
  const makeModel = [partCompatibility.make?.name, partCompatibility.model?.name].filter(Boolean).join(" ");
  const years = formatPartYearRange(partCompatibility.yearStart, partCompatibility.yearEnd);
  const details = [makeModel || "Universal", years, partCompatibility.trim, partCompatibility.engine].filter(Boolean);
  return details.join(" · ");
}

function formatPartYearRange(start: number | null, end: number | null) {
  if (start && end) return start === end ? String(start) : `${start}-${end}`;
  if (start) return `${start}+`;
  if (end) return `Through ${end}`;
  return null;
}

function formatPerformanceMetric(value: number | null, unit: string) {
  return value === null ? "Unknown" : `${value.toLocaleString()} ${unit}`;
}
