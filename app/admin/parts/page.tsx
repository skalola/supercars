import { AdminPartsClient, type AdminAffiliatePartnerRow, type AdminPartBrandRow, type AdminPartCategoryRow, type AdminPerformancePartRow } from "@/components/admin/AdminPartsClient";
import { getMakeModelCatalogOptions } from "@/lib/makes/catalog";
import { prisma } from "@/lib/prisma";

export default async function AdminPartsPage() {
  const [categories, brands, affiliatePartners, parts, catalog] = await Promise.all([
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
    active: partner.active,
    partCount: partner._count.parts,
  }));

  const partRows: AdminPerformancePartRow[] = parts.map((part) => ({
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
    sourceUrl: part.sourceUrl,
    compatibility: part.compatibility.map(formatCompatibility),
    updatedAt: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(part.updatedAt),
  }));

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
        makes={catalog.makes}
        models={catalog.models}
      />
    </main>
  );
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
