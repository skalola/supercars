import { PrismaClient } from "@prisma/client";
import {
  AFFILIATE_PARTNER_SEEDS,
  PART_BRAND_SEEDS,
  PART_CATEGORY_SEEDS,
} from "@/lib/parts/catalog-foundation";

const prisma = new PrismaClient();

async function main() {
  const [categories, brands, affiliatePartners] = await Promise.all([
    Promise.all(
      PART_CATEGORY_SEEDS.map((category) =>
        prisma.partCategory.upsert({
          where: { slug: category.slug },
          update: {
            name: category.name,
            description: category.description,
            displayOrder: category.displayOrder,
            active: true,
          },
          create: {
            name: category.name,
            slug: category.slug,
            description: category.description,
            displayOrder: category.displayOrder,
            active: true,
          },
        })
      )
    ),
    Promise.all(
      PART_BRAND_SEEDS.map(async (brand) => {
        const row = await prisma.partBrand.upsert({
          where: { slug: brand.slug },
          update: {
            name: brand.name,
            logoUrl: brand.logoUrl ?? null,
            logoSourceUrl: brand.logoUrl ?? null,
            logoBackground: brand.logoUrl ? "TRANSPARENT" : "UNKNOWN",
            logoVerifiedAt: brand.logoUrl ? new Date() : null,
            logoNeedsReview: !brand.logoUrl,
            websiteUrl: brand.websiteUrl ?? null,
            country: brand.country ?? null,
            active: true,
          },
          create: {
            name: brand.name,
            slug: brand.slug,
            logoUrl: brand.logoUrl ?? null,
            logoSourceUrl: brand.logoUrl ?? null,
            logoBackground: brand.logoUrl ? "TRANSPARENT" : "UNKNOWN",
            logoVerifiedAt: brand.logoUrl ? new Date() : null,
            logoNeedsReview: !brand.logoUrl,
            websiteUrl: brand.websiteUrl ?? null,
            country: brand.country ?? null,
            active: true,
          },
        });

        return row;
      })
    ),
    Promise.all(
      AFFILIATE_PARTNER_SEEDS.map((partner) =>
        prisma.affiliatePartner.upsert({
          where: { slug: partner.slug },
          update: {
            name: partner.name,
            network: partner.network,
            websiteUrl: partner.websiteUrl,
            status: partner.status,
            commissionLabel: partner.commissionLabel,
            active: false,
          },
          create: {
            name: partner.name,
            slug: partner.slug,
            network: partner.network,
            websiteUrl: partner.websiteUrl,
            status: partner.status,
            commissionLabel: partner.commissionLabel,
            active: false,
          },
        })
      )
    ),
  ]);

  const summary = {
    categories: categories.length,
    brands: brands.length,
    affiliateCandidates: affiliatePartners.length,
    note: "Only catalog containers and inactive affiliate candidates were seeded. No fake performance parts were created.",
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
