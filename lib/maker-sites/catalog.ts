import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { compareCatalogLabels } from "@/lib/makes/catalog-order";

export const getMakerSiteCatalog = unstable_cache(
  async (makeSlug: string) => {
    const make = await prisma.make.findUnique({
      where: { slug: makeSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        region: true,
        models: {
          select: {
            id: true,
            name: true,
            slug: true,
            productionStartYear: true,
            productionEndYear: true,
            bodyStyle: true,
            category: true,
            images: {
              where: { reviewStatus: { notIn: ["NEEDS_REVIEW", "REJECTED"] } },
              select: { url: true, type: true },
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              take: 1,
            },
          },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!make) return null;
    return { ...make, models: [...make.models].sort(compareCatalogLabels) };
  },
  ["maker-site-catalog-v2"],
  { revalidate: 86_400, tags: ["make-model-catalog"] },
);
