import { AdminPartsClient, type AdminAffiliateAnalyticsRow, type AdminAffiliatePartnerRow, type AdminPartBrandRow, type AdminPartCategoryRow, type AdminPerformancePartRow, type AdminRecentAffiliateClickRow } from "@/components/admin/AdminPartsClient";
import { getMakeModelCatalogOptions } from "@/lib/makes/catalog";
import { isAffiliateTrackingReady } from "@/lib/parts/affiliate-tracking";
import { auditPerformancePartTrust } from "@/lib/parts/trust";
import { prisma } from "@/lib/prisma";

export default async function AdminPartsPage() {
  const recentWindowStart = new Date();
  recentWindowStart.setDate(recentWindowStart.getDate() - 30);

  const [categories, brands, affiliatePartners, parts, recentClicks, totalClicks, recentClickCount, catalog] = await Promise.all([
    prisma.partCategory.findMany({
      include: {
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
      include: {
        _count: {
          select: { parts: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.affiliatePartner.findMany({
      include: {
        _count: {
          select: { parts: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.performancePart.findMany({
      include: {
        category: true,
        brand: true,
        affiliatePartner: true,
        _count: {
          select: {
            clicks: true,
          },
        },
        compatibility: {
          include: {
            make: true,
            model: true,
          },
          orderBy: [
            { createdAt: "asc" },
          ],
        },
      },
      orderBy: [
        { updatedAt: "desc" },
        { name: "asc" },
      ],
      take: 500,
    }),
    prisma.partAffiliateClick.findMany({
      include: {
        part: {
          include: {
            brand: true,
            category: true,
          },
        },
        affiliatePartner: true,
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
    getMakeModelCatalogOptions(),
  ]);

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

  const analyticsRows = buildAffiliateAnalyticsRows(parts);
  const clickRouteCounts = countClickRoutes(recentClicks);
  const recentClickRows: AdminRecentAffiliateClickRow[] = recentClicks.map((click) => ({
    id: click.id,
    partName: click.part.name,
    brandName: click.part.brand.name,
    categoryName: click.part.category.name,
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

  const configuredParts = parts.filter((part) => isAffiliateTrackingReady(part)).length;
  const estimatedCommissionCents = parts.reduce((sum, part) => {
    if (!part.commissionRateBps || !part.retailPriceCents || part._count.clicks === 0) return sum;
    return sum + Math.round((part.retailPriceCents * part.commissionRateBps * part._count.clicks) / 10000);
  }, 0);

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
        affiliateAnalytics={{
          totalClicks,
          recentClickCount,
          affiliateClickCount: clickRouteCounts.affiliate,
          sourceClickCount: clickRouteCounts.source,
          configuredParts,
          estimatedCommissionLabel: formatCents(estimatedCommissionCents),
          topParts: analyticsRows.topParts,
          topBrands: analyticsRows.topBrands,
          recentClicks: recentClickRows,
        }}
        makes={catalog.makes}
        models={catalog.models}
      />
    </main>
  );
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

function buildAffiliateAnalyticsRows(parts: Array<{
  name: string;
  retailPriceCents: number | null;
  commissionRateBps: number | null;
  brand: { name: string };
  category: { name: string };
  affiliatePartner: { name: string } | null;
  _count: { clicks: number };
}>) {
  const topParts: AdminAffiliateAnalyticsRow[] = parts
    .filter((part) => part._count.clicks > 0)
    .map((part) => ({
      label: part.name,
      detail: [part.brand.name, part.category.name, part.affiliatePartner?.name].filter(Boolean).join(" · "),
      clicks: part._count.clicks,
      estimatedCommissionLabel: formatCents(estimateCommissionCents(part.retailPriceCents, part.commissionRateBps, part._count.clicks)),
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 6);

  const brandMap = parts.reduce((map, part) => {
    const current = map.get(part.brand.name) ?? {
      label: part.brand.name,
      detail: "Brand",
      clicks: 0,
      estimatedCommissionCents: 0,
    };
    current.clicks += part._count.clicks;
    current.estimatedCommissionCents += estimateCommissionCents(part.retailPriceCents, part.commissionRateBps, part._count.clicks);
    map.set(part.brand.name, current);
    return map;
  }, new Map<string, { label: string; detail: string; clicks: number; estimatedCommissionCents: number }>());

  const topBrands: AdminAffiliateAnalyticsRow[] = Array.from(brandMap.values())
    .filter((row) => row.clicks > 0)
    .map((row) => ({
      label: row.label,
      detail: row.detail,
      clicks: row.clicks,
      estimatedCommissionLabel: formatCents(row.estimatedCommissionCents),
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 6);

  return { topParts, topBrands };
}

function estimateCommissionCents(retailPriceCents: number | null, commissionRateBps: number | null, clicks: number) {
  if (!retailPriceCents || !commissionRateBps || clicks <= 0) return 0;
  return Math.round((retailPriceCents * commissionRateBps * clicks) / 10000);
}

function formatCents(value: number | null) {
  if (value === null) return "No price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
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
