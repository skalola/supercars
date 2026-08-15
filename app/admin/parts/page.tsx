import { AdminPartsClient, type AdminAffiliateAnalyticsRow, type AdminAffiliatePartnerRow, type AdminPartBrandRow, type AdminPartCategoryRow, type AdminPerformancePartRow, type AdminRecentAffiliateClickRow } from "@/components/admin/AdminPartsClient";
import { getCatalogMakeOptions } from "@/lib/makes/catalog";
import { isAffiliateTrackingReady } from "@/lib/parts/affiliate-tracking";
import { auditPerformancePartTrust } from "@/lib/parts/trust";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AdminPagination, parseAdminPage } from "@/components/admin/AdminPagination";

const ADMIN_PARTS_PAGE_LIMIT = 50;

const publicReadyPartWhere = {
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
} satisfies Prisma.PerformancePartWhereInput;

const adminPartSelect = {
  id: true,
  name: true,
  partNumber: true,
  status: true,
  sourceUrl: true,
  sourceConfidence: true,
  imageUrl: true,
  trackingStatus: true,
  retailPriceCents: true,
  estimatedHpGain: true,
  estimatedTorqueGain: true,
  affiliatePartnerId: true,
  affiliateUrl: true,
  commissionRateBps: true,
  updatedAt: true,
  category: {
    select: { name: true },
  },
  brand: {
    select: { name: true },
  },
  affiliatePartner: {
    select: {
      name: true,
      status: true,
      active: true,
    },
  },
  _count: {
    select: {
      clicks: true,
    },
  },
  compatibility: {
    select: {
      make: {
        select: { name: true },
      },
      model: {
        select: { name: true },
      },
      yearStart: true,
      yearEnd: true,
      trim: true,
      engine: true,
      makeId: true,
      modelId: true,
    },
    orderBy: [
      { createdAt: "asc" },
    ],
  },
} satisfies Prisma.PerformancePartSelect;

export default async function AdminPartsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    page?: string | string[];
    q?: string;
    category?: string;
    brand?: string;
    status?: string;
    trust?: string;
  }>;
}) {
  const params = await searchParams;
  const requestedPage = parseAdminPage(params?.page);
  const filters = {
    search: params?.q?.trim() || "",
    category: params?.category?.trim() || "",
    brand: params?.brand?.trim() || "",
    status: params?.status?.trim() || "",
    trust: params?.trust?.trim() || "",
  };
  const partWhere = getAdminPartWhere(filters);
  const recentWindowStart = new Date();
  recentWindowStart.setDate(recentWindowStart.getDate() - 30);

  const [
    categories,
    brands,
    affiliatePartners,
    totalParts,
    publicReadyParts,
    filteredPartCount,
    recentClicks,
    totalClicks,
    recentClickCount,
    configuredParts,
    makeOptions,
    ferrariCanonicalParts,
    ferrariModelsCovered,
    ferrariPartsWithOffers,
    activeEbayOffers,
    latestCatalogRun,
    latestOfferRun,
    sourceFailureRuns,
  ] = await Promise.all([
    prisma.partCategory.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: {
          select: { parts: true },
        },
      },
      orderBy: [
        { displayOrder: "asc" },
        { name: "asc" },
      ],
    }),
    prisma.partBrand.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        websiteUrl: true,
        country: true,
        _count: {
          select: { parts: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.affiliatePartner.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        network: true,
        websiteUrl: true,
        commissionLabel: true,
        trackingTemplate: true,
        disclosure: true,
        active: true,
        _count: {
          select: { parts: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.performancePart.count(),
    prisma.performancePart.count({ where: publicReadyPartWhere }),
    prisma.performancePart.count({ where: partWhere }),
    prisma.partAffiliateClick.findMany({
      select: {
        id: true,
        sourcePath: true,
        outboundUrl: true,
        createdAt: true,
        part: {
          select: {
            name: true,
            brand: {
              select: { name: true },
            },
            category: {
              select: { name: true },
            },
          },
        },
        modelPartComponent: {
          select: {
            componentType: { select: { name: true, category: { select: { name: true } } } },
            model: { select: { name: true, make: { select: { name: true } } } },
          },
        },
        affiliatePartner: {
          select: { name: true },
        },
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.partAffiliateClick.count(),
    prisma.partAffiliateClick.count({
      where: { createdAt: { gte: recentWindowStart } },
    }),
    prisma.performancePart.count({
      where: {
        trackingStatus: "CONFIGURED",
        affiliateUrl: { not: null },
        affiliatePartner: {
          active: true,
          status: { in: ["APPROVED", "ACTIVE"] },
        },
      },
    }),
    getCatalogMakeOptions(),
    prisma.performancePart.count({
      where: { compatibility: { some: { model: { make: { slug: "ferrari" } } } } },
    }),
    prisma.model.count({
      where: { make: { slug: "ferrari" }, partCompatibility: { some: {} } },
    }),
    prisma.performancePart.count({
      where: {
        compatibility: { some: { model: { make: { slug: "ferrari" } } } },
        offers: { some: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
      },
    }),
    prisma.partOffer.count({
      where: {
        provider: "EBAY",
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }),
    prisma.partSourceRun.findFirst({
      where: { source: "SCUDERIA_CAR_PARTS" },
      select: { status: true, startedAt: true, completedAt: true },
      orderBy: { startedAt: "desc" },
    }),
    prisma.partSourceRun.findFirst({
      where: { source: "EBAY_BROWSE_API" },
      select: { status: true, startedAt: true, completedAt: true },
      orderBy: { startedAt: "desc" },
    }),
    prisma.partSourceRun.count({ where: { status: { in: ["FAILED", "PARTIAL", "BLOCKED"] } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredPartCount / ADMIN_PARTS_PAGE_LIMIT));
  const page = Math.min(requestedPage, totalPages);
  const parts = await prisma.performancePart.findMany({
    where: partWhere,
    select: adminPartSelect,
    orderBy: [
      { updatedAt: "desc" },
      { name: "asc" },
    ],
    skip: (page - 1) * ADMIN_PARTS_PAGE_LIMIT,
    take: ADMIN_PARTS_PAGE_LIMIT,
  });

  const categoryRows: AdminPartCategoryRow[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    partCount: category._count.parts,
  }));

  const brandRows: AdminPartBrandRow[] = brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    websiteUrl: brand.websiteUrl,
    country: brand.country,
    partCount: brand._count.parts,
  }));

  const affiliatePartnerRows: AdminAffiliatePartnerRow[] = affiliatePartners.map((partner) => ({
    id: partner.id,
    name: partner.name,
    status: partner.status,
    network: partner.network,
    websiteUrl: partner.websiteUrl,
    commissionLabel: partner.commissionLabel,
    trackingTemplate: partner.trackingTemplate,
    disclosure: partner.disclosure,
    active: partner.active,
    partCount: partner._count.parts,
  }));

  const partRows: AdminPerformancePartRow[] = parts.map((part) => {
    const trustAudit = auditPerformancePartTrust(part);

    return {
      id: part.id,
      name: part.name,
      partNumber: part.partNumber,
      status: part.status,
      sourceConfidence: part.sourceConfidence,
      trackingStatus: part.trackingStatus,
      retailPrice: formatCents(part.retailPriceCents),
      estimatedHpGain: part.estimatedHpGain === null ? "No HP estimate" : `+${part.estimatedHpGain.toLocaleString()} hp`,
      estimatedTorqueGain: part.estimatedTorqueGain === null ? "No torque estimate" : `+${part.estimatedTorqueGain.toLocaleString()} lb-ft`,
      categoryName: part.category.name,
      brandName: part.brand.name,
      affiliatePartnerId: part.affiliatePartnerId,
      affiliatePartnerName: part.affiliatePartner?.name ?? null,
      affiliateUrl: part.affiliateUrl,
      commissionRateBps: part.commissionRateBps,
      affiliateReady: isAffiliateTrackingReady(part),
      clickCount: part._count.clicks,
      sourceUrl: part.sourceUrl,
      publicEligible: trustAudit.publicEligible,
      trustScore: trustAudit.score,
      trustIssues: trustAudit.issues,
      trustWarnings: trustAudit.warnings,
      compatibility: part.compatibility.map(formatCompatibility),
      updatedAt: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(part.updatedAt),
    };
  });

  const analyticsRows = await getAffiliateAnalyticsRows();
  const clickRouteCounts = countClickRoutes(recentClicks);
  const recentClickRows: AdminRecentAffiliateClickRow[] = recentClicks.map((click) => ({
    id: click.id,
    partName: click.part?.name || click.modelPartComponent?.componentType.name || "Component offer",
    brandName: click.part?.brand.name || click.modelPartComponent?.model.make.name || "Marketplace",
    categoryName: click.part?.category.name || click.modelPartComponent?.componentType.category.name || "Uncategorized",
    affiliatePartnerName: click.affiliatePartner?.name ?? null,
    routeType: getClickRouteType(click.sourcePath),
    routeSource: getClickRouteSource(click.sourcePath),
    sourcePath: click.sourcePath,
    outboundUrl: click.outboundUrl,
    userLabel: click.user?.name || click.user?.email || "Anonymous",
    clickedAt: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(click.createdAt),
  }));

  const estimatedCommissionCents = analyticsRows.estimatedCommissionCents;

  return (
    <main className="page-shell wide">
      <section className="page-header">
        <div>
          <div className="eyebrow">Admin Parts</div>
          <h1 className="page-title compact">Parts Catalog</h1>
          <p className="page-copy">
            Capture real performance categories, brands, product records, and make/model compatibility before activating affiliate tracking.
          </p>
        </div>
      </section>

      <AdminPartsClient
        categories={categoryRows}
        brands={brandRows}
        affiliatePartners={affiliatePartnerRows}
        parts={partRows}
        catalogSummary={{
          totalParts,
          publicReadyParts,
          needsReviewParts: Math.max(0, totalParts - publicReadyParts),
          ferrariCanonicalParts,
          ferrariModelsCovered,
          ferrariPartsWithOffers,
          ferrariPartsWithoutOffers: Math.max(0, ferrariCanonicalParts - ferrariPartsWithOffers),
          activeEbayOffers,
          sourceFailureRuns,
          lastCatalogRefresh: formatRunDate(latestCatalogRun),
          lastEbayRefresh: formatRunDate(latestOfferRun),
        }}
        activeFilters={filters}
        affiliateAnalytics={{
          totalClicks,
          recentClickCount,
          affiliateClickCount: clickRouteCounts.affiliate,
          sourceClickCount: clickRouteCounts.source,
          configuredParts,
          estimatedCommissionLabel: formatCents(estimatedCommissionCents),
          topParts: analyticsRows.topParts,
          topBrands: analyticsRows.topBrands,
          topModels: analyticsRows.topModels,
          topCategories: analyticsRows.topCategories,
          topProviders: analyticsRows.topProviders,
          recentClicks: recentClickRows,
        }}
        makes={makeOptions}
      />
      <AdminPagination
        pathname="/admin/parts"
        page={page}
        totalPages={totalPages}
        preserveParams={{
          q: filters.search,
          category: filters.category,
          brand: filters.brand,
          status: filters.status,
          trust: filters.trust,
        }}
        ariaLabel="Parts catalog pages"
      />
    </main>
  );
}

type AdminPartFilters = {
  search: string;
  category: string;
  brand: string;
  status: string;
  trust: string;
};

function getAdminPartWhere(filters: AdminPartFilters): Prisma.PerformancePartWhereInput {
  const predicates: Prisma.PerformancePartWhereInput[] = [];
  if (filters.category) predicates.push({ category: { name: filters.category } });
  if (filters.brand) predicates.push({ brand: { name: filters.brand } });
  if (filters.status) predicates.push({ status: filters.status });
  if (filters.trust === "PUBLIC_READY") predicates.push(publicReadyPartWhere);
  if (filters.trust === "NEEDS_REVIEW") predicates.push({ NOT: publicReadyPartWhere });
  if (filters.search) {
    predicates.push({
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { partNumber: { contains: filters.search, mode: "insensitive" } },
        { category: { name: { contains: filters.search, mode: "insensitive" } } },
        { brand: { name: { contains: filters.search, mode: "insensitive" } } },
        { compatibility: { some: { make: { name: { contains: filters.search, mode: "insensitive" } } } } },
        { compatibility: { some: { model: { name: { contains: filters.search, mode: "insensitive" } } } } },
      ],
    });
  }
  return predicates.length > 0 ? { AND: predicates } : {};
}

function countClickRoutes(clicks: Array<{ sourcePath: string | null }>) {
  return clicks.reduce(
    (counts, click) => {
      const routeType = getClickRouteType(click.sourcePath);
      if (routeType === "affiliate") counts.affiliate += 1;
      if (routeType === "source") counts.source += 1;
      return counts;
    },
    { affiliate: 0, source: 0 },
  );
}

function getClickRouteType(sourcePath: string | null): "affiliate" | "source" | "unknown" {
  if (sourcePath?.startsWith("affiliate:")) return "affiliate";
  if (sourcePath?.startsWith("source:")) return "source";
  return "unknown";
}

function getClickRouteSource(sourcePath: string | null) {
  if (!sourcePath) return null;
  if (sourcePath.startsWith("affiliate:")) return sourcePath.slice("affiliate:".length);
  if (sourcePath.startsWith("source:")) return sourcePath.slice("source:".length);
  return sourcePath;
}

async function getAffiliateAnalyticsRows() {
  type AnalyticsRow = {
    label: string;
    detail: string;
    clicks: bigint;
    estimatedCommissionCents: number;
  };
  const [topParts, topBrands, topModels, topCategories, topProviders, commission] = await Promise.all([
    prisma.$queryRaw<AnalyticsRow[]>(Prisma.sql`
      SELECT part."name" AS label,
        concat_ws(' · ', brand."name", category."name", affiliate."name") AS detail,
        COUNT(click."id")::bigint AS clicks,
        COALESCE(part."retailPriceCents" * part."commissionRateBps" * COUNT(click."id") / 10000.0, 0)::double precision AS "estimatedCommissionCents"
      FROM "PartAffiliateClick" click
      JOIN "PerformancePart" part ON part."id" = click."partId"
      JOIN "PartBrand" brand ON brand."id" = part."brandId"
      JOIN "PartCategory" category ON category."id" = part."categoryId"
      LEFT JOIN "AffiliatePartner" affiliate ON affiliate."id" = part."affiliatePartnerId"
      GROUP BY part."id", brand."name", category."name", affiliate."name"
      ORDER BY clicks DESC, part."name" ASC
      LIMIT 6
    `),
    prisma.$queryRaw<AnalyticsRow[]>(Prisma.sql`
      SELECT brand."name" AS label, 'Brand' AS detail,
        COUNT(click."id")::bigint AS clicks,
        COALESCE(SUM(part."retailPriceCents" * part."commissionRateBps" / 10000.0), 0)::double precision AS "estimatedCommissionCents"
      FROM "PartAffiliateClick" click
      JOIN "PerformancePart" part ON part."id" = click."partId"
      JOIN "PartBrand" brand ON brand."id" = part."brandId"
      GROUP BY brand."id"
      ORDER BY clicks DESC, brand."name" ASC
      LIMIT 6
    `),
    prisma.$queryRaw<AnalyticsRow[]>(Prisma.sql`
      SELECT model."name" AS label, make."name" AS detail,
        COUNT(DISTINCT click."id")::bigint AS clicks,
        0::double precision AS "estimatedCommissionCents"
      FROM "PartAffiliateClick" click
      JOIN "PartCompatibility" fitment ON fitment."partId" = click."partId"
      JOIN "Model" model ON model."id" = fitment."modelId"
      JOIN "Make" make ON make."id" = model."makeId"
      GROUP BY model."id", make."name"
      ORDER BY clicks DESC, model."name" ASC
      LIMIT 6
    `),
    prisma.$queryRaw<AnalyticsRow[]>(Prisma.sql`
      SELECT category."name" AS label, 'Category' AS detail,
        COUNT(click."id")::bigint AS clicks,
        0::double precision AS "estimatedCommissionCents"
      FROM "PartAffiliateClick" click
      JOIN "PerformancePart" part ON part."id" = click."partId"
      JOIN "PartCategory" category ON category."id" = part."categoryId"
      GROUP BY category."id"
      ORDER BY clicks DESC, category."name" ASC
      LIMIT 6
    `),
    prisma.$queryRaw<AnalyticsRow[]>(Prisma.sql`
      SELECT COALESCE(click."provider", affiliate."name", 'Source') AS label, 'Provider' AS detail,
        COUNT(click."id")::bigint AS clicks,
        0::double precision AS "estimatedCommissionCents"
      FROM "PartAffiliateClick" click
      LEFT JOIN "AffiliatePartner" affiliate ON affiliate."id" = click."affiliatePartnerId"
      GROUP BY COALESCE(click."provider", affiliate."name", 'Source')
      ORDER BY clicks DESC, label ASC
      LIMIT 6
    `),
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(part."retailPriceCents" * part."commissionRateBps" / 10000.0), 0)::double precision AS total
      FROM "PartAffiliateClick" click
      JOIN "PerformancePart" part ON part."id" = click."partId"
    `),
  ]);
  const mapRow = (row: AnalyticsRow): AdminAffiliateAnalyticsRow => ({
    label: row.label,
    detail: row.detail,
    clicks: Number(row.clicks),
    estimatedCommissionLabel: formatCents(Math.round(row.estimatedCommissionCents)),
  });

  return {
    topParts: topParts.map(mapRow),
    topBrands: topBrands.map(mapRow),
    topModels: topModels.map(mapRow),
    topCategories: topCategories.map(mapRow),
    topProviders: topProviders.map(mapRow),
    estimatedCommissionCents: Math.round(commission[0]?.total ?? 0),
  };
}

function formatCents(value: number | null) {
  if (value === null) return "No price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function formatRunDate(run: { status: string; startedAt: Date; completedAt: Date | null } | null) {
  if (!run) return "Never";
  const date = run.completedAt ?? run.startedAt;
  return `${run.status} / ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function formatCompatibility(partCompatibility: {
  make: { name: string } | null;
  model: { name: string } | null;
  yearStart: number | null;
  yearEnd: number | null;
  trim: string | null;
  engine: string | null;
}) {
  const makeModel = [partCompatibility.make?.name, partCompatibility.model?.name].filter(Boolean).join(" ");
  const years = formatYearRange(partCompatibility.yearStart, partCompatibility.yearEnd);
  const details = [makeModel || "Universal", years, partCompatibility.trim, partCompatibility.engine].filter(Boolean);
  return details.join(" · ");
}

function formatYearRange(start: number | null, end: number | null) {
  if (start && end) return start === end ? String(start) : `${start}-${end}`;
  if (start) return `${start}+`;
  if (end) return `Through ${end}`;
  return null;
}
