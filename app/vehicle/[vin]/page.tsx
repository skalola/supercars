/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import MaintenanceIntelligence from "./MaintenanceIntelligence";
import { getMarketSummary } from "@/lib/market-intelligence";
import MarketPriceHistory from "@/components/market/MarketPriceHistory";
import PurchaseWizard from "@/components/market/PurchaseWizard";
import OwnerSaleControls from "@/components/market/OwnerSaleControls";
import VehiclePhotoGallery, { VehicleGalleryImage } from "@/components/market/VehiclePhotoGallery";
import { AddToFavoritesButton } from "@/components/garage/AddToFavoritesButton";
import { getVehicleHeroImage, isNonVehicleImageUrl } from "@/lib/vehicle-images";
import { isValidEmail } from "@/lib/fulfillment/partner-registry";
import { emailMatchesWebsiteDomain } from "@/lib/directory/contact-domain-policy";
import { calculateModifiedPerformance } from "@/lib/parts/performance";
import { isAffiliateTrackingReady } from "@/lib/parts/affiliate-tracking";
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

  const [maintenanceRules, market, serviceShops, savedFavorite, recommendedParts] = await Promise.all([
    prisma.maintenanceRule.findMany({
      where: {
        OR: [
          { modelId: null },
          { modelId: vehicle.modelId }
        ]
      }
    }),
    getMarketSummary(vehicle.modelId),
    prisma.partnerContact.findMany({
      where: {
        type: "SERVICE_SHOP",
        active: true,
        contactStatus: "RESOLVED",
        email: { not: null },
        latitude: { not: null },
        longitude: { not: null },
        NOT: {
          email: "",
        },
      },
      orderBy: [{ confidence: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        website: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        makeSpecialization: true,
      },
    }),
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
        OR: [
          { compatibility: { none: {} } },
          {
            compatibility: {
              some: {
                AND: [
                  {
                    OR: [
                      { makeId: null },
                      { makeId: vehicle.model.makeId },
                    ],
                  },
                  {
                    OR: [
                      { modelId: null },
                      { modelId: vehicle.modelId },
                    ],
                  },
                  {
                    OR: [
                      { yearStart: null },
                      { yearStart: { lte: vehicle.year } },
                    ],
                  },
                  {
                    OR: [
                      { yearEnd: null },
                      { yearEnd: { gte: vehicle.year } },
                    ],
                  },
                ],
              },
            },
          },
        ],
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
  ]);

  const makeName = vehicle.model.make.name;
  const performanceSummary = calculateModifiedPerformance({
    stockHorsepower: vehicle.engineHP || vehicle.model.spec?.horsepower,
    stockTorque: vehicle.model.spec?.torque,
    installedParts: vehicle.installedParts || [],
  });
  const unlinkedModifications = (vehicle.modifications || []).filter((mod: any) => !mod.catalogInstall);
  const recommendedPerformancePreview = recommendedParts.reduce(
    (summary, part) => ({
      hp: summary.hp + (part.estimatedHpGain || 0),
      torque: summary.torque + (part.estimatedTorqueGain || 0),
    }),
    { hp: 0, torque: 0 }
  );
  const serviceShopNames = serviceShops
    .filter((shop) => isValidEmail(shop.email) && emailMatchesWebsiteDomain(shop.email, shop.website))
    .filter((shop) => {
      const specialization = shop.makeSpecialization?.toLowerCase() || "all";
      const make = makeName.toLowerCase();
      return specialization === "all" || specialization.includes(make);
    })
    .map((shop) => ({
      id: shop.id,
      name: shop.name,
      email: shop.email!,
      city: shop.city,
      state: shop.state,
      latitude: shop.latitude!,
      longitude: shop.longitude!,
    }));

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

  // Dynamic Health Score calculations
  let healthScore = 0;
  const healthChecklist = [];

  // 1. VIN Verified (+20)
  const vinVerified = vehicle.status === "CLAIMED";
  if (vinVerified) {
    healthScore += 20;
    healthChecklist.push({ label: "VIN Verified", complete: true });
  } else {
    healthChecklist.push({ label: "VIN Verified", complete: false, missingText: "VIN Unverified" });
  }

  // 2. Owner Profile Complete (+15)
  const profileComplete = !!vehicle.profile && !!vehicle.profile.exteriorColor && !!vehicle.profile.interiorColor;
  if (profileComplete) {
    healthScore += 15;
    healthChecklist.push({ label: "Owner Profile Complete", complete: true });
  } else {
    healthChecklist.push({
      label: "Owner Profile Complete",
      complete: false,
      missingText: "Owner Profile Incomplete",
      actionText: "Update profile",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  // 3. Photos Added (+15)
  const photosAdded = vehicle.photos && vehicle.photos.length > 0;
  if (photosAdded) {
    healthScore += 15;
    healthChecklist.push({ label: "Photos Added", complete: true });
  } else {
    healthChecklist.push({
      label: "Photos Added",
      complete: false,
      missingText: "Photos Missing",
      actionText: "Add vehicle photos",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  // 4. Service History Added (+20)
  const serviceHistoryAdded = vehicle.serviceRecords && vehicle.serviceRecords.length > 0;
  if (serviceHistoryAdded) {
    healthScore += 20;
    healthChecklist.push({ label: "Service History Added", complete: true });
  } else {
    healthChecklist.push({
      label: "Service History Added",
      complete: false,
      missingText: "Service History Missing",
      actionText: "Update service history",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  // 5. Inspection Report Added (+15)
  const hasInspectionDoc = vehicle.documents?.some((d: any) => d.documentType === "Inspection Report");
  if (hasInspectionDoc) {
    healthScore += 15;
    healthChecklist.push({ label: "Inspection Report Added", complete: true });
  } else {
    healthChecklist.push({
      label: "Inspection Report Added",
      complete: false,
      missingText: "Inspection Report Missing",
      actionText: "Add inspection report",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  // 6. Maintenance Mileage Added (+15)
  const mileageAdded = vehicle.profile && vehicle.profile.currentMileage !== null && vehicle.profile.currentMileage !== undefined;
  if (mileageAdded) {
    healthScore += 15;
    healthChecklist.push({ label: "Maintenance Mileage Added", complete: true });
  } else {
    healthChecklist.push({
      label: "Maintenance Mileage Added",
      complete: false,
      missingText: "Maintenance Mileage Missing",
      actionText: "Add current mileage",
      link: `/vehicle/${vehicle.vin}/edit`
    });
  }

  const sections = [
    {
      title: "Vehicle Identity",
      fields: [
        ["VIN", vehicle.vin],
        ["Year", vehicle.year],
        ["Make", vehicle.model.make.name],
        ["Model", vehicle.model.name],
        ["Trim", vehicle.trim],
        ["Series", vehicle.series],
        ["Destination Market", vehicle.destinationMarket],
      ],
    },
    {
      title: "Powertrain",
      fields: [
        ["Engine", vehicle.engine],
        ["Engine Configuration", vehicle.engineConfiguration],
        ["Cylinders", vehicle.engineCylinders],
        ["Displacement", vehicle.displacement],
        ["Turbo", vehicle.turbo],
        ["Transmission", vehicle.transmission],
        ["Transmission Speeds", vehicle.transmissionSpeeds],
        ["Drivetrain", vehicle.drivetrain],
        ["Fuel Type", vehicle.fuelType],
        ["Electrification Level", vehicle.electrificationLevel],
        ["Engine HP", vehicle.engineHP],
        ["Engine kW", vehicle.engineKW],
        ["Engine Manufacturer", vehicle.engineManufacturer],
      ],
    },
    {
      title: "Body",
      fields: [
        ["Body Style", vehicle.bodyStyle],
        ["Vehicle Type", vehicle.vehicleType],
        ["Doors", vehicle.doors],
        ["Color", vehicle.color],
        ["Mileage", vehicle.mileage],
        ["GVWR", vehicle.gvwr],
      ],
    },
    {
      title: "Manufacturing",
      fields: [
        ["Manufacturer", vehicle.manufacturer],
        ["Plant Country", vehicle.plantCountry],
        ["Plant City", vehicle.plantCity],
        ["Plant State", vehicle.plantState],
      ],
    },
    {
      title: "Safety",
      fields: [
        ["Brake System", vehicle.brakeSystem],
        ["ABS", vehicle.abs],
        ["ESC", vehicle.esc],
        ["TPMS", vehicle.tpms],
        ["Rear Visibility System", vehicle.rearVisibilitySystem],
        ["Park Assist", vehicle.parkAssist],
        ["Adaptive Driving Beam", vehicle.adaptiveDrivingBeam],
        ["Front Airbags", vehicle.airBagLocFront],
        ["Knee Airbags", vehicle.airBagLocKnee],
        ["Side Airbags", vehicle.airBagLocSide],
        ["Pretensioner", vehicle.pretensioner],
        ["Seat Belts", vehicle.seatBeltsAll],
      ],
    },
  ];

  const { success: successParam } = (await searchParams) || {};
  const isOwner = !!(session?.user?.id && vehicle.ownerId === session.user.id && vehicle.status === "CLAIMED");
  let resolvedHeroImage = getVehicleHeroImage(vehicle);
  const heroPhoto = vehicle.photos?.find((p: any) => p.isHero) || vehicle.photos?.[0];

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
  if (!hasOwnerPhotos && activeListing?.imageUrl) {
    resolvedHeroImage = activeListing.imageUrl;
  }
  
  const isForSale = !!activeListing;
  const askingPrice = activeListing?.askingPrice || activeListing?.price || null;
  const localSeller = activeListing?.seller || null;
  const localSellerLabel = localSeller?.username || localSeller?.name || "SUPERCAR DASH owner";
  const localSellerHref = localSeller?.username ? `/garage/${localSeller.username}` : "/garage";
  const originalListingUrl = activeListing?.sellerId
    ? null
    : activeListing?.url || vehicle.listings.find((listing) => !listing.sellerId && listing.url)?.url || null;
  const galleryImages = buildVehicleGalleryImages(vehicle, resolvedHeroImage, activeListing?.imageUrl || null);
  const meetAppearances = vehicle.meetRsvps
    .filter((rsvp) => ["PUBLISHED", "FULL", "COMPLETED"].includes(rsvp.meet.status))
    .map((rsvp) => ({
      slug: rsvp.meet.slug,
      title: rsvp.meet.title,
      detail: `${rsvp.meet.type} · ${rsvp.meet.city}, ${rsvp.meet.state}`,
      date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(rsvp.meet.startsAt),
      status: rsvp.meet.status === "COMPLETED" ? "Completed" : "Upcoming",
    }));
  const meetGalleryPhotos = vehicle.meetPhotos
    .filter((photo) => ["PUBLISHED", "FULL", "COMPLETED"].includes(photo.meet.status))
    .map((photo) => ({
      id: photo.id,
      url: photo.url,
      caption: photo.caption,
      meetHref: `/meets/${photo.meet.slug}`,
      meetTitle: photo.meet.title,
      date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(photo.meet.startsAt),
    }));
  const heroStyle = resolvedHeroImage
    ? ({ "--vehicle-passport-hero-image": `url("${resolvedHeroImage}")` } as CSSProperties)
    : undefined;

  return (
    <main className="vehicle-passport-shell">
      <section className="vehicle-passport-hero" style={heroStyle}>
        <div className="vehicle-passport-hero-shade" aria-hidden="true" />
        <div className="vehicle-passport-hero-content">
          <div>
            <div className="vehicle-passport-eyebrow">Vehicle Passport</div>
            <h1>
              {vehicle.year} {vehicle.model.make.name} {vehicle.model.name}
            </h1>
            <p>
              VIN {vehicle.vin}
              {vehicle.trim ? ` · ${vehicle.trim}` : ""}
              {currentMileage !== null && currentMileage !== undefined ? ` · ${currentMileage.toLocaleString()} mi` : ""}
            </p>
          </div>
          <div className="vehicle-passport-chips" aria-label="Vehicle status">
          {isForSale && (
            <span className="vehicle-status-chip sale">
              FOR SALE
            </span>
          )}
          {vehicle.status === "CLAIMED" && (
            <span className="vehicle-status-chip verified">
              Verified Owner
            </span>
          )}
          {isForSale && askingPrice !== null && (
            <span className="vehicle-status-price">
              ${askingPrice.toLocaleString()}
            </span>
          )}
        </div>
        </div>
      </section>

      {/* Success Banners */}
      {successParam === "listed" && (
        <div className="vehicle-passport-alert success" style={{
          backgroundColor: "#dcfce7",
          color: "#15803d",
          border: "1px solid #bbf7d0",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "20px",
          fontSize: "14px",
          fontWeight: 600
        }}>
          ✓ Vehicle successfully listed for sale!
        </div>
      )}
      {successParam === "removed" && (
        <div className="vehicle-passport-alert removed" style={{
          backgroundColor: "#fee2e2",
          color: "#991b1b",
          border: "1px solid #fecaca",
          padding: "12px 16px",
          borderRadius: "8px",
          marginBottom: "20px",
          fontSize: "14px",
          fontWeight: 600
        }}>
          ✓ Listing removed successfully.
        </div>
      )}

      {/* Buyer CTA Block */}
      {!isOwner && isForSale && (
        <section className="vehicle-purchase-panel">
          <div className="vehicle-purchase-panel-inner">
            <div>
              <span className="vehicle-purchase-label">
                Available For Purchase
              </span>
              <h3>
                Interested in acquiring this supercar?
              </h3>
              <p>
                List Price: <strong>${askingPrice?.toLocaleString()}</strong>
              </p>
              {localSeller ? (
                <a
                  href={localSellerHref}
                  className="vehicle-source-link"
                >
                  Listed by {localSellerLabel}
                </a>
              ) : originalListingUrl ? (
                <a
                  href={originalListingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vehicle-source-link"
                >
                  View original listing
                </a>
              ) : null}
            </div>
            <div className="vehicle-purchase-action">
              <div className="vehicle-purchase-buttons">
                <AddToFavoritesButton modelId={vehicle.modelId} initialSaved={Boolean(savedFavorite)} />
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
              </div>
            </div>
          </div>
        </section>
      )}



      {!isOwner && resolvedHeroImage && galleryImages.length > 0 && (
        <VehiclePhotoGallery images={galleryImages} initialImageSrc={resolvedHeroImage} />
      )}

      {isOwner && (
        <section className="vehicle-owner-passport-panel" style={{
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          padding: "24px",
          backgroundColor: "#fafafa",
          display: "grid",
          gap: "24px",
          marginBottom: "32px"
        }}>
          {/* Summary Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px", color: "#111827" }}>Vehicle Passport</h2>
              {/* Vehicle name */}
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#4b5563", marginBottom: "8px" }}>
                {vehicle.model.make.name} {vehicle.model.name}
                {(vehicle.series || vehicle.trim) && ` - ${vehicle.series || vehicle.trim}`}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{
                  backgroundColor: "#dcfce7",
                  color: "#15803d",
                  fontSize: "12px",
                  fontWeight: "bold",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  textTransform: "uppercase"
                }}>
                  Claimed
                </span>
                {isOwner && (
                  <span style={{
                    backgroundColor: "#dbeafe",
                    color: "#1d4ed8",
                    fontSize: "12px",
                    fontWeight: "bold",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    ✓ Verified Owner
                  </span>
                )}
              </div>
            </div>
            
            {isOwner && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <a href={`/vehicle/${vehicle.vin}/edit`} style={{
                  backgroundColor: "#111827",
                  color: "#ffffff",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textDecoration: "none",
                  cursor: "pointer",
                  transition: "background-color 0.2s"
                }}>
                  Edit Vehicle
                </a>
                <OwnerSaleControls vin={vin} isForSale={isForSale} askingPrice={askingPrice} />
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            {/* 1. Hero Photo */}
            {resolvedHeroImage ? (
              <div style={{
                borderRadius: "12px",
                overflow: "hidden",
                position: "relative",
                height: "100%",
                minHeight: "140px",
                backgroundColor: "#f3f4f6"
              }}>
                <img src={resolvedHeroImage} alt="Hero Vehicle" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ) : (
              <div style={{
                border: "2px dashed #e5e7eb",
                borderRadius: "12px",
                padding: "32px 16px",
                textAlign: "center",
                backgroundColor: "#ffffff",
                color: "#9ca3af",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: "4px"
              }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>📷</div>
                <div>[ Future Hero Vehicle Photo ]</div>
              </div>
            )}

            {/* 2. Next Maintenance Summary */}
            <div style={{
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "16px",
              backgroundColor: "#ffffff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between"
            }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", display: "block" }}>Next Service</span>
                {(() => {
                  if (currentMileage === null || currentMileage === undefined) {
                    return (
                      <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px", fontStyle: "italic" }}>
                        Add current mileage to get personalized recommendations.
                      </div>
                    );
                  }
                  if (sortedRules.length === 0) {
                    return (
                      <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px", fontStyle: "italic" }}>
                        No service rules defined.
                      </div>
                    );
                  }
                  
                  const rule = sortedRules[0];
                  let recText = "";
                  if (rule.intervalMiles) {
                    const records = vehicle.serviceRecords.filter((r: any) => r.description?.startsWith(`[${rule.serviceName}]`));
                    const lastCompletedMileage = records.reduce((max: number, r: any) => Math.max(max, r.mileage || 0), 0);
                    
                    let nextMilestone = Math.ceil(currentMileage / rule.intervalMiles) * rule.intervalMiles;
                    while (nextMilestone <= lastCompletedMileage) {
                      nextMilestone += rule.intervalMiles;
                    }

                    const remaining = nextMilestone - currentMileage;
                    if (remaining < 0) {
                      recText = `${Math.abs(remaining).toLocaleString()} miles overdue`;
                    } else if (remaining === 0) {
                      recText = "Due Now";
                    } else {
                      recText = `${remaining.toLocaleString()} miles remaining`;
                    }
                  } else if (rule.intervalMonths) {
                    recText = rule.intervalMonths === 12 
                      ? "Recommended annually" 
                      : `Recommended every ${rule.intervalMonths} months`;
                  }

                  return (
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                        {rule.serviceName}
                      </div>
                      <div style={{ fontSize: "13px", color: "#4b5563", marginTop: "2px" }}>
                        {recText}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "12px" }}>
                <span style={{ fontSize: "14px" }}>🔧</span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#4b5563" }}>Maintenance Intel</span>
              </div>
            </div>

            {/* 3. Market Value */}
            {market.hasData ? (
              <div style={{
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "16px",
                backgroundColor: "#ffffff",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", display: "block" }}>Market Value</span>
                  {market.range && (
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                        ${market.range.averageAskingPrice.toLocaleString()}
                      </div>
                      <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "2px" }}>
                        ${market.range.lowestPrice.toLocaleString()} &ndash; ${market.range.highestPrice.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#4b5563" }}>{market.supply.activeListingCount} active listing{market.supply.activeListingCount !== 1 ? "s" : ""}</span>
                </div>
              </div>
            ) : (
              <div style={{
                border: "2px dashed #e5e7eb",
                borderRadius: "12px",
                padding: "32px 16px",
                textAlign: "center",
                backgroundColor: "#ffffff",
                color: "#9ca3af",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                gap: "4px"
              }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>💰</div>
                <div>[ Future Market Value ]</div>
              </div>
            )}

          </div>

          {/* Vehicle Health Section */}
          <div style={{
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "24px",
            backgroundColor: "#ffffff",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "24px",
            marginTop: "24px"
          }}>
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", margin: "0 0 16px 0" }}>
                Vehicle Health
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  border: "4px solid #10b981",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#10b981"
                }}>
                  {healthScore}%
                </div>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                    Passport Completeness
                  </div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                    Dynamic ownership intelligence score
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px", alignContent: "center" }}>
              {healthChecklist.map((item, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                  {item.complete ? (
                    <>
                      <span style={{ color: "#10b981", fontWeight: "bold" }}>✓</span>
                      <span style={{ color: "#374151", fontWeight: 500 }}>{item.label}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: "#f59e0b", fontWeight: "bold" }}>⚠</span>
                      <span style={{ color: "#6b7280" }}>
                        {item.missingText || item.label}
                        {isOwner && item.actionText && (
                          <>
                            {" — "}
                            <a href={item.link} style={{ color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
                              {item.actionText}
                            </a>
                          </>
                        )}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Passport Sections */}
          <div style={{ display: "grid", gap: "24px", borderTop: "1px solid #e5e7eb", paddingTop: "24px", marginTop: "24px" }}>
            
            {/* 1. Vehicle Information */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>ℹ️</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Vehicle Information</span>
              </div>
              
              {!vehicle.profile || (!vehicle.profile.exteriorColor && !vehicle.profile.interiorColor && !vehicle.profile.currentMileage && !vehicle.profile.ownerNotes) ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {vehicle.profile.exteriorColor && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                      <span style={{ color: "#6b7280" }}>Exterior Color</span>
                      <span style={{ fontWeight: 600, color: "#111827" }}>{vehicle.profile.exteriorColor}</span>
                    </div>
                  )}
                  {vehicle.profile.interiorColor && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                      <span style={{ color: "#6b7280" }}>Interior Color</span>
                      <span style={{ fontWeight: 600, color: "#111827" }}>{vehicle.profile.interiorColor}</span>
                    </div>
                  )}
                  {vehicle.profile.currentMileage !== null && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                      <span style={{ color: "#6b7280" }}>Current Mileage</span>
                      <span style={{ fontWeight: 600, color: "#111827" }}>{vehicle.profile.currentMileage.toLocaleString()} mi</span>
                    </div>
                  )}
                  {vehicle.profile.ownerNotes && (
                    <div style={{ marginTop: "8px", borderTop: "1px solid #f3f4f6", paddingTop: "8px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase" }}>Owner Notes</span>
                      <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#374151", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {vehicle.profile.ownerNotes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Photos */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>🖼️</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Photos</span>
              </div>

              {vehicle.photos?.length === 0 ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "16px" }}>
                  {/* Hero Image Centerpiece */}
                  {heroPhoto && (
                    <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: "8px", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
                      <img src={heroPhoto.filePath} alt={heroPhoto.caption || "Hero Vehicle"} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      {heroPhoto.caption && (
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", color: "#ffffff", padding: "8px 12px", fontSize: "13px" }}>
                          {heroPhoto.caption}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Gallery grid of other photos */}
                  {vehicle.photos.length > 1 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "12px" }}>
                      {vehicle.photos.filter((p: any) => p.id !== heroPhoto?.id).map((p: any) => (
                        <div key={p.id} style={{ position: "relative", paddingTop: "66.67%", borderRadius: "6px", overflow: "hidden", backgroundColor: "#f3f4f6" }}>
                          <img src={p.filePath} alt={p.caption || "Gallery Vehicle"} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Meet History */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>📍</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Meet History</span>
              </div>

              {meetAppearances.length === 0 && meetGalleryPhotos.length === 0 ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No meet history yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {meetAppearances.length > 0 ? (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {meetAppearances.map((meet) => (
                        <Link
                          key={meet.slug}
                          href={`/meets/${meet.slug}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: "12px",
                            alignItems: "center",
                            padding: "12px",
                            border: "1px solid #f3f4f6",
                            borderRadius: "8px",
                            backgroundColor: "#fafafa",
                            color: "#111827",
                            textDecoration: "none",
                          }}
                        >
                          <span style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                            <strong style={{ overflow: "hidden", fontSize: "14px", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meet.title}</strong>
                            <span style={{ color: "#6b7280", fontSize: "12px" }}>{meet.detail}</span>
                          </span>
                          <span style={{ display: "grid", gap: "4px", textAlign: "right" }}>
                            <strong style={{ color: meet.status === "Completed" ? "#059669" : "#dc2626", fontSize: "12px", textTransform: "uppercase" }}>{meet.status}</strong>
                            <span style={{ color: "#6b7280", fontSize: "12px" }}>{meet.date}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {meetGalleryPhotos.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px" }}>
                      {meetGalleryPhotos.map((photo) => (
                        <Link
                          key={photo.id}
                          href={photo.meetHref}
                          style={{
                            overflow: "hidden",
                            border: "1px solid #f3f4f6",
                            borderRadius: "8px",
                            backgroundColor: "#fafafa",
                            color: "#111827",
                            textDecoration: "none",
                          }}
                        >
                          <img src={photo.url} alt={photo.caption || photo.meetTitle} style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }} />
                          <span style={{ display: "grid", gap: "3px", padding: "9px" }}>
                            <strong style={{ overflow: "hidden", fontSize: "12px", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{photo.meetTitle}</strong>
                            <span style={{ color: "#6b7280", fontSize: "11px" }}>{photo.date}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* 3. Service History */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>📋</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Service History</span>
              </div>

              {!vehicle.serviceRecords || vehicle.serviceRecords.length === 0 ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {vehicle.serviceRecords.map((srv: any) => (
                    <div key={srv.id} style={{ padding: "12px", border: "1px solid #f3f4f6", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: "#111827" }}>{new Date(srv.serviceDate).toLocaleDateString()}</span>
                        {srv.cost !== null && <span style={{ fontWeight: 600, color: "#059669" }}>${srv.cost.toLocaleString()}</span>}
                      </div>
                      <div style={{ display: "flex", gap: "12px", fontSize: "13px", color: "#6b7280" }}>
                        {srv.mileage !== null && <span>{srv.mileage.toLocaleString()} mi</span>}
                        {srv.shopName && <span>• {srv.shopName}</span>}
                      </div>
                      {srv.description && (
                        <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#4b5563", lineHeight: 1.4 }}>
                          {srv.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Inspection Reports */}
            {isOwner && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "18px" }}>🔍</span>
                  <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Inspection Reports</span>
                </div>
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              </div>
            )}

            {/* 5. Documents */}
            {isOwner && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "18px" }}>📁</span>
                  <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Documents</span>
                </div>

                {vehicle.documents?.length === 0 ? (
                  <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
                ) : (
                  <div style={{ display: "grid", gap: "16px" }}>
                    {[
                      { displayTitle: "Inspection Reports", types: ["Inspection Report"] },
                      { displayTitle: "Service Invoices", types: ["Service Invoice"] },
                      { displayTitle: "Awards", types: ["Award Certificate"] },
                      { displayTitle: "Other", types: ["Registration", "Warranty", "Other"] }
                    ].map((group) => {
                      const docs = vehicle.documents.filter((d: any) => group.types.includes(d.documentType));
                      if (docs.length === 0) return null;

                      return (
                        <div key={group.displayTitle} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "12px" }}>
                          <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#6b7280", margin: "0 0 8px 0", textTransform: "uppercase" }}>{group.displayTitle}</h4>
                          <div style={{ display: "grid", gap: "8px" }}>
                            {docs.map((doc: any) => (
                              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "16px" }}>📄</span>
                                <div>
                                  <a href={doc.filePath} target="_blank" rel="noopener noreferrer" style={{ fontSize: "14px", fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>
                                    {doc.title}
                                  </a>
                                  <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "8px" }}>
                                    ({new Date(doc.createdAt).toLocaleDateString()})
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 6. Modifications */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>⚡</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Parts & Performance</span>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                  <PassportMetric label="Stock HP" value={formatPerformanceMetric(performanceSummary.stockHorsepower, "hp")} />
                  <PassportMetric label="Estimated HP" value={formatPerformanceMetric(performanceSummary.modifiedHorsepower, "hp")} accent={performanceSummary.hpGain > 0 ? `+${performanceSummary.hpGain} hp` : undefined} />
                  <PassportMetric label="Stock Torque" value={formatPerformanceMetric(performanceSummary.stockTorque, "lb-ft")} />
                  <PassportMetric label="Estimated Torque" value={formatPerformanceMetric(performanceSummary.modifiedTorque, "lb-ft")} accent={performanceSummary.torqueGain > 0 ? `+${performanceSummary.torqueGain} lb-ft` : undefined} />
                </div>

                {vehicle.installedParts && vehicle.installedParts.length > 0 ? (
                  vehicle.installedParts.map((installedPart: any) => {
                    const label = installedPart.part?.name || installedPart.customName || "Owner-reported part";
                    const brand = installedPart.part?.brand?.name || installedPart.customBrandName;
                    const category = installedPart.part?.category?.name || installedPart.category?.name;
                    const hpGain = installedPart.hpGainOverride ?? installedPart.part?.estimatedHpGain;
                    const torqueGain = installedPart.torqueGainOverride ?? installedPart.part?.estimatedTorqueGain;

                    return (
                      <div key={installedPart.id} style={{ padding: "12px", border: "1px solid #f3f4f6", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "14px", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, color: "#111827" }}>{label}</span>
                          <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>{installedPart.part ? "Catalog" : "Manual"}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", fontSize: "13px", color: "#4b5563" }}>
                          {brand && <span>Brand: {brand}</span>}
                          {category && <span>Category: {category}</span>}
                          {installedPart.installedDate && <span>Installed: {installedPart.installedDate}</span>}
                          {hpGain !== null && hpGain !== undefined && <span>+{hpGain} hp</span>}
                          {torqueGain !== null && torqueGain !== undefined && <span>+{torqueGain} lb-ft</span>}
                        </div>
                        {installedPart.notes && (
                          <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#6b7280", lineHeight: 1.4 }}>
                            {installedPart.notes}
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No parts logged yet.</span>
                )}

                {unlinkedModifications.map((mod: any) => (
                  <div key={mod.id} style={{ padding: "12px", border: "1px solid #f3f4f6", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 600, color: "#111827" }}>{mod.name}</span>
                      {mod.installedDate && <span style={{ fontSize: "13px", color: "#6b7280" }}>Installed: {mod.installedDate}</span>}
                    </div>
                    {mod.brand && <p style={{ margin: "2px 0", fontSize: "13px", color: "#4b5563" }}>Brand: {mod.brand}</p>}
                    {mod.description && (
                      <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#6b7280", lineHeight: 1.4 }}>
                        {mod.description}
                      </p>
                    )}
                  </div>
                ))}

                <div className="vehicle-parts-recommendations" aria-label="Compatible performance part recommendations">
                  <div className="vehicle-parts-recommendations-header">
                    <div>
                      <span>Recommended Upgrades</span>
                      <strong>{recommendedParts.length.toLocaleString()} compatible part{recommendedParts.length === 1 ? "" : "s"}</strong>
                    </div>
                    {(recommendedPerformancePreview.hp > 0 || recommendedPerformancePreview.torque > 0) && (
                      <div>
                        {recommendedPerformancePreview.hp > 0 ? <em>+{recommendedPerformancePreview.hp.toLocaleString()} hp cataloged</em> : null}
                        {recommendedPerformancePreview.torque > 0 ? <em>+{recommendedPerformancePreview.torque.toLocaleString()} lb-ft cataloged</em> : null}
                      </div>
                    )}
                  </div>

                  {recommendedParts.length === 0 ? (
                    <p className="vehicle-parts-empty">
                      No compatible catalog upgrades are active yet for this model.
                    </p>
                  ) : (
                    <div className="vehicle-parts-recommendation-grid">
                      {recommendedParts.map((part) => {
                        const trackingReady = isAffiliateTrackingReady(part);
                        const fitment = part.compatibility.map(formatPartCompatibility).filter(Boolean);

                        return (
                          <article key={part.id} className="vehicle-parts-recommendation-card">
                            {part.imageUrl ? (
                              <img src={part.imageUrl} alt="" loading="lazy" />
                            ) : (
                              <div className="vehicle-parts-recommendation-placeholder">{part.category.name}</div>
                            )}
                            <div>
                              <div className="vehicle-parts-recommendation-kicker">
                                <span>{part.category.name}</span>
                                <span>{part.brand.name}</span>
                              </div>
                              <h4>{part.name}</h4>
                              {part.partNumber ? <p className="vehicle-parts-sku">Part #{part.partNumber}</p> : null}
                              {part.description ? <p>{part.description}</p> : null}
                              <div className="vehicle-parts-pill-row">
                                <span>{formatPartPrice(part.retailPriceCents)}</span>
                                {part.estimatedHpGain ? <span>+{part.estimatedHpGain.toLocaleString()} hp</span> : null}
                                {part.estimatedTorqueGain ? <span>+{part.estimatedTorqueGain.toLocaleString()} lb-ft</span> : null}
                                {fitment[0] ? <span>{fitment[0]}</span> : <span>Universal / unscoped</span>}
                              </div>
                              <div className="vehicle-parts-recommendation-actions">
                                {part.sourceUrl ? (
                                  <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer">
                                    Review Source
                                  </a>
                                ) : (
                                  <span>No source</span>
                                )}
                                {trackingReady ? (
                                  <a href={`/out/parts/${part.id}?source=/vehicle/${vehicle.vin}`} rel="nofollow sponsored">
                                    Shop Partner
                                  </a>
                                ) : (
                                  <button type="button" disabled>
                                    Affiliate Pending
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 7. Awards */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "12px", backgroundColor: "#ffffff", padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "18px" }}>🏆</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Awards</span>
              </div>

              {!vehicle.awards || vehicle.awards.length === 0 ? (
                <span style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>No records yet.</span>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {vehicle.awards.map((awd: any) => (
                    <div key={awd.id} style={{ padding: "12px", border: "1px solid #f3f4f6", borderRadius: "8px", backgroundColor: "#fafafa" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: "#111827" }}>{awd.title}</span>
                        {awd.awardDate && <span style={{ fontSize: "13px", color: "#6b7280" }}>{new Date(awd.awardDate).toLocaleDateString()}</span>}
                      </div>
                      {awd.eventName && <p style={{ margin: "2px 0", fontSize: "13px", color: "#4b5563" }}>Event: {awd.eventName}</p>}
                      {awd.description && (
                        <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#6b7280", lineHeight: 1.4 }}>
                          {awd.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </section>
      )}

      <div className="vehicle-decode-grid" style={{ display: "grid", gap: 32 }}>
        {sections.map((section) => {
          const visibleFields = section.fields.filter(([, value]) => {
            if (value === null || value === undefined || value === "") return false;
            if (typeof value === "string" && value.trim().toLowerCase() === "unknown") return false;
            return true;
          });

          if (visibleFields.length === 0) return null;

          return (
            <section key={section.title} className="vehicle-decode-card">
              <h2 style={{ fontSize: 20, borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 16, color: "#666" }}>
                {section.title}
              </h2>
              <div style={{ display: "grid", gap: 8 }}>
                {visibleFields.map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ color: "#888" }}>{label}</span>
                    <span style={{ fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Market Intelligence Section (visible to everyone) */}
      <section className="vehicle-market-panel" style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "24px",
        backgroundColor: "#ffffff",
        display: "grid",
        gap: "16px",
        marginTop: "32px",
        marginBottom: "32px",
        boxSizing: "border-box",
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <span style={{ fontWeight: 700, color: "#111827", fontSize: "16px" }}>Market Intelligence</span>
        </div>

        {market.hasData ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: "12px", minWidth: 0 }}>
              {market.range && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#f9fafb" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Average Asking Price</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginTop: 4 }}>${market.range.averageAskingPrice.toLocaleString()}</div>
                </div>
              )}
              {market.range && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#f9fafb" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Market Range</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginTop: 4 }}>${market.range.lowestPrice.toLocaleString()} &ndash; ${market.range.highestPrice.toLocaleString()}</div>
                </div>
              )}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#f9fafb" }}>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Active Listings</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginTop: 4 }}>{market.supply.activeListingCount}</div>
              </div>
              {market.recentSales.salesCount > 0 && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#f9fafb" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Recent Sales</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginTop: 4 }}>{market.recentSales.salesCount}</div>
                </div>
              )}
            </div>
            
            {vehicle.modelId && (
              <div style={{ marginTop: "8px", minWidth: 0, maxWidth: "100%" }}>
                <MarketPriceHistory modelId={vehicle.modelId} />
              </div>
            )}
          </>
        ) : (
          <div>
            <div style={{ fontSize: "14px", color: "#6b7280", fontStyle: "italic" }}>
              No market data available yet.
            </div>
            <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "12px", borderTop: "1px solid #f3f4f6", paddingTop: "8px" }}>
              <strong>Monitored Sources:</strong> Bring a Trailer, RM Sotheby&apos;s, DuPont Registry, and supported dealer networks
            </div>
          </div>
        )}
      </section>

      {!isOwner && (
        <section className="vehicle-public-parts-panel">
          <div className="vehicle-public-parts-header">
            <div>
              <span>Compatible Parts</span>
              <h2>Recommended Upgrades</h2>
            </div>
            {(recommendedPerformancePreview.hp > 0 || recommendedPerformancePreview.torque > 0) && (
              <div>
                {recommendedPerformancePreview.hp > 0 ? <em>+{recommendedPerformancePreview.hp.toLocaleString()} hp cataloged</em> : null}
                {recommendedPerformancePreview.torque > 0 ? <em>+{recommendedPerformancePreview.torque.toLocaleString()} lb-ft cataloged</em> : null}
              </div>
            )}
          </div>

          {recommendedParts.length === 0 ? (
            <p className="vehicle-parts-empty">No compatible catalog upgrades are active yet for this model.</p>
          ) : (
            <div className="vehicle-parts-recommendation-grid">
              {recommendedParts.map((part) => {
                const trackingReady = isAffiliateTrackingReady(part);
                const fitment = part.compatibility.map(formatPartCompatibility).filter(Boolean);

                return (
                  <article key={part.id} className="vehicle-parts-recommendation-card">
                    {part.imageUrl ? (
                      <img src={part.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="vehicle-parts-recommendation-placeholder">{part.category.name}</div>
                    )}
                    <div>
                      <div className="vehicle-parts-recommendation-kicker">
                        <span>{part.category.name}</span>
                        <span>{part.brand.name}</span>
                      </div>
                      <h4>{part.name}</h4>
                      {part.partNumber ? <p className="vehicle-parts-sku">Part #{part.partNumber}</p> : null}
                      {part.description ? <p>{part.description}</p> : null}
                      <div className="vehicle-parts-pill-row">
                        <span>{formatPartPrice(part.retailPriceCents)}</span>
                        {part.estimatedHpGain ? <span>+{part.estimatedHpGain.toLocaleString()} hp</span> : null}
                        {part.estimatedTorqueGain ? <span>+{part.estimatedTorqueGain.toLocaleString()} lb-ft</span> : null}
                        {fitment[0] ? <span>{fitment[0]}</span> : <span>Universal / unscoped</span>}
                      </div>
                      <div className="vehicle-parts-recommendation-actions">
                        {part.sourceUrl ? (
                          <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer">
                            Review Source
                          </a>
                        ) : (
                          <span>No source</span>
                        )}
                        {trackingReady ? (
                          <a href={`/out/parts/${part.id}?source=/vehicle/${vehicle.vin}`} rel="nofollow sponsored">
                            Shop Partner
                          </a>
                        ) : (
                          <button type="button" disabled>
                            Affiliate Pending
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Maintenance Intelligence Section */}
      <MaintenanceIntelligence
        vin={vehicle.vin}
        isOwner={isOwner}
        currentMileage={currentMileage ?? null}
        sortedRules={sortedRules}
        serviceRecords={vehicle.serviceRecords}
        makeName={makeName}
        serviceShops={serviceShopNames}
      />
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

function PassportMetric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ minWidth: 0, padding: "10px", border: "1px solid #f3f4f6", borderRadius: "8px", backgroundColor: "#ffffff" }}>
      <span style={{ display: "block", color: "#6b7280", fontSize: "10px", fontWeight: 800, textTransform: "uppercase" }}>{label}</span>
      <strong style={{ display: "block", marginTop: "5px", color: "#111827", fontSize: "16px", lineHeight: 1.05 }}>{value}</strong>
      {accent && <span style={{ display: "block", marginTop: "4px", color: "#b91c1c", fontSize: "11px", fontWeight: 800 }}>{accent}</span>}
    </div>
  );
}

function formatPerformanceMetric(value: number | null, unit: string) {
  return value === null ? "Unknown" : `${value.toLocaleString()} ${unit}`;
}
