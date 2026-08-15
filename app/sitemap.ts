import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

export const revalidate = 86_400;

const staticRoutes: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/inventory", changeFrequency: "hourly", priority: 0.95 },
  { path: "/makes", changeFrequency: "weekly", priority: 0.85 },
  { path: "/meets", changeFrequency: "daily", priority: 0.8 },
  { path: "/clubs", changeFrequency: "daily", priority: 0.75 },
  { path: "/parts", changeFrequency: "daily", priority: 0.85 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/financial-privacy", changeFrequency: "yearly", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const generatedAt = new Date();
  const entries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: generatedAt,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const [makes, models, meets, clubs, garages, listingVehicles, parts] = await Promise.all([
      prisma.make.findMany({ select: { slug: true, updatedAt: true } }),
      prisma.model.findMany({
        select: {
          slug: true,
          updatedAt: true,
          make: { select: { slug: true } },
          images: {
            where: { reviewStatus: { not: "NEEDS_REVIEW" } },
            select: { url: true },
            orderBy: [{ type: "asc" }, { createdAt: "asc" }],
            take: 1,
          },
        },
      }),
      prisma.meet.findMany({
        where: { visibility: "PUBLIC", status: { in: ["PUBLISHED", "FULL", "COMPLETED"] } },
        select: { slug: true, updatedAt: true, heroImageUrl: true },
        take: 500,
      }),
      prisma.carClub.findMany({
        where: { visibility: "PUBLIC", status: "ACTIVE" },
        select: { slug: true, updatedAt: true, logoUrl: true },
        take: 500,
      }),
      prisma.user.findMany({
        where: { username: { not: null } },
        select: { username: true, updatedAt: true, image: true },
        take: 5_000,
      }),
      prisma.listing.findMany({
        where: {
          status: "ACTIVE",
          validationStatus: "VALID",
          vehicleId: { not: null },
          imageUrl: { not: null },
          vehicle: { is: { inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] } } },
        },
        distinct: ["vehicleId"],
        select: {
          updatedAt: true,
          imageUrl: true,
          vehicle: { select: { vin: true } },
        },
        take: 10_000,
      }),
      prisma.performancePart.findMany({
        where: {
          status: "ACTIVE",
          sourceConfidence: "SOURCE_VERIFIED",
          imageUrl: { not: null },
          sourceUrl: { not: null },
        },
        select: {
          slug: true,
          updatedAt: true,
          imageUrl: true,
          brand: { select: { slug: true } },
        },
        take: 10_000,
      }),
    ]);

    entries.push(
      ...makes.map((make) => ({
        url: `${SITE_URL}/make/${make.slug}`,
        lastModified: make.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.75,
      })),
      ...models.map((model) => ({
        url: `${SITE_URL}/make/${model.make.slug}/${model.slug}`,
        lastModified: model.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
        images: model.images[0]?.url ? [absoluteUrl(model.images[0].url)] : undefined,
      })),
      ...meets.map((meet) => ({
        url: `${SITE_URL}/meets/${meet.slug}`,
        lastModified: meet.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.7,
        images: meet.heroImageUrl ? [absoluteUrl(meet.heroImageUrl)] : undefined,
      })),
      ...clubs.map((club) => ({
        url: `${SITE_URL}/clubs/${club.slug}`,
        lastModified: club.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.65,
        images: club.logoUrl ? [absoluteUrl(club.logoUrl)] : undefined,
      })),
      ...garages.map((user) => ({
        url: `${SITE_URL}/garage/${encodeURIComponent(user.username!)}`,
        lastModified: user.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
        images: user.image ? [absoluteUrl(user.image)] : undefined,
      })),
      ...listingVehicles.flatMap((listing) => listing.vehicle ? [{
        url: `${SITE_URL}/vehicle/${listing.vehicle.vin}`,
        lastModified: listing.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.75,
        images: listing.imageUrl ? [absoluteUrl(listing.imageUrl)] : undefined,
      }] : []),
      ...parts.map((part) => ({
        url: `${SITE_URL}/parts/${part.brand.slug}/${part.slug}`,
        lastModified: part.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.65,
        images: part.imageUrl ? [absoluteUrl(part.imageUrl)] : undefined,
      })),
    );
  } catch (error) {
    console.error("[seo] Dynamic sitemap records unavailable", error);
  }

  return entries;
}
