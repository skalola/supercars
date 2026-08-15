import { PrismaClient } from "@prisma/client";
import {
  buildPreferredBrandScopeKey,
  getManufacturerEcosystemFixture,
  type EcosystemBrandFixture,
} from "../lib/parts/ecosystem-config";
import { ensureEbayOfferProvider } from "../lib/parts/ebay-partner";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const fixture = getManufacturerEcosystemFixture("ferrari");
  if (!fixture?.productionEnabled || fixture.makeSlug !== "ferrari") {
    throw new Error("Ferrari is the only production-enabled parts ecosystem in this sprint.");
  }
  const ferrari = await prisma.make.findUnique({ where: { slug: "ferrari" }, select: { id: true } });
  if (!ferrari) throw new Error("Ferrari make record is missing.");

  const ebay = await ensureEbayOfferProvider(prisma);
  const scuderia = await ensureProvider({
    code: "SCUDERIA",
    name: "Scuderia Car Parts",
    providerType: "SCUDERIA",
    websiteUrl: "https://www.scuderiacarparts.com",
    active: false,
  });
  const providers = new Map([["EBAY", ebay.id], ["SCUDERIA", scuderia.id]]);
  const categories = await prisma.partCategory.findMany({
    select: { id: true, slug: true, componentTypes: { select: { id: true, slug: true } } },
  });
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  let brandsConfigured = 0;
  let mappingsConfigured = 0;

  for (const brandFixture of fixture.brands) {
    const brand = await ensureBrand(brandFixture);
    brandsConfigured += 1;
    const scopes = brandFixture.categorySlugs?.length ? brandFixture.categorySlugs : [null];
    for (const categorySlug of scopes) {
      const category = categorySlug ? categoryBySlug.get(categorySlug) : null;
      if (categorySlug && !category) continue;
      const componentScopes = brandFixture.componentSlugs?.length ? brandFixture.componentSlugs : [null];
      for (const componentSlug of componentScopes) {
        const component = componentSlug ? category?.componentTypes.find((item) => item.slug === componentSlug) : null;
        if (componentSlug && !component) continue;
        const scopeKey = buildPreferredBrandScopeKey({
          makeSlug: fixture.makeSlug,
          brandSlug: brandFixture.slug,
          categorySlug,
          componentSlug,
        });
        await prisma.preferredPartBrand.upsert({
          where: { scopeKey },
          update: {
            relationshipType: brandFixture.relationshipType,
            priority: brandFixture.priority,
            officialCatalogUrl: brandFixture.officialCatalogUrl ?? null,
            affiliateEnabled: brandFixture.affiliateEnabled ?? false,
            affiliateStatus: brandFixture.affiliateStatus ?? "NOT_CONTACTED",
            offerProviderId: brandFixture.providerCode ? providers.get(brandFixture.providerCode) ?? null : null,
            active: true,
          },
          create: {
            scopeKey,
            vehicleMakeId: ferrari.id,
            partBrandId: brand.id,
            componentCategoryId: category?.id ?? null,
            componentTypeId: component?.id ?? null,
            relationshipType: brandFixture.relationshipType,
            priority: brandFixture.priority,
            officialCatalogUrl: brandFixture.officialCatalogUrl ?? null,
            affiliateEnabled: brandFixture.affiliateEnabled ?? false,
            affiliateStatus: brandFixture.affiliateStatus ?? "NOT_CONTACTED",
            offerProviderId: brandFixture.providerCode ? providers.get(brandFixture.providerCode) ?? null : null,
            active: true,
          },
        });
        mappingsConfigured += 1;
      }
    }
  }

  const linkedOffers = await prisma.partOffer.updateMany({
    where: { provider: "EBAY", providerId: null },
    data: { providerId: ebay.id },
  });
  console.log(JSON.stringify({
    productionMake: "ferrari",
    providersConfigured: providers.size,
    brandsConfigured,
    mappingsConfigured,
    existingEbayOffersLinked: linkedOffers.count,
    nonFerrariCatalogsIngested: 0,
  }, null, 2));
}

async function ensureBrand(fixture: EcosystemBrandFixture) {
  const existing = await prisma.partBrand.findUnique({
    where: { slug: fixture.slug },
    select: { id: true, name: true, brandType: true },
  });
  if (!existing) {
    return prisma.partBrand.create({
      data: { name: fixture.name, slug: fixture.slug, brandType: fixture.brandType, active: true },
      select: { id: true },
    });
  }
  if (existing.brandType !== fixture.brandType) {
    return prisma.partBrand.update({
      where: { id: existing.id },
      data: { brandType: fixture.brandType },
      select: { id: true },
    });
  }
  return { id: existing.id };
}

async function ensureProvider(input: {
  code: string;
  name: string;
  providerType: string;
  websiteUrl: string;
  active: boolean;
}) {
  const existing = await prisma.partOfferProvider.findUnique({ where: { code: input.code } });
  if (!existing) return prisma.partOfferProvider.create({ data: input, select: { id: true } });
  if (
    existing.name !== input.name ||
    existing.providerType !== input.providerType ||
    existing.websiteUrl !== input.websiteUrl ||
    existing.active !== input.active
  ) {
    return prisma.partOfferProvider.update({ where: { id: existing.id }, data: input, select: { id: true } });
  }
  return { id: existing.id };
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
