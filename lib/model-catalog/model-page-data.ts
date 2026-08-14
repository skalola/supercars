import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export const modelPageCatalogSelect = {
  id: true,
  makeId: true,
  name: true,
  slug: true,
  productionStartYear: true,
  productionEndYear: true,
  category: true,
  bodyStyle: true,
  productionCount: true,
  description: true,
  metadataStatus: true,
  metadataSource: true,
  metadataSourceUrl: true,
  make: {
    select: {
      name: true,
      slug: true,
      logoUrl: true,
    },
  },
  spec: {
    select: {
      engine: true,
      displacement: true,
      cylinders: true,
      horsepower: true,
      torque: true,
      transmission: true,
      drivetrain: true,
      topSpeed: true,
      zeroToSixty: true,
      weight: true,
    },
  },
  variants: {
    select: {
      id: true,
      name: true,
      productionStartYear: true,
      productionEndYear: true,
      productionCount: true,
      description: true,
    },
    orderBy: [{ productionStartYear: "asc" }, { name: "asc" }],
    take: 24,
  },
  images: {
    select: {
      id: true,
      url: true,
      type: true,
      source: true,
      sourceUrl: true,
      sourceName: true,
      attribution: true,
      attributionUrl: true,
      reviewStatus: true,
    },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    take: 12,
  },
} satisfies Prisma.ModelSelect;

const maintenanceRuleSelect = {
  id: true,
  serviceName: true,
  description: true,
  intervalMiles: true,
  intervalMonths: true,
  priority: true,
} satisfies Prisma.MaintenanceRuleSelect;

export const getModelPageCatalogData = unstable_cache(
  async (makeSlug: string, modelSlug: string) => {
    const model = await prisma.model.findFirst({
      where: {
        slug: modelSlug,
        make: { slug: makeSlug },
      },
      select: modelPageCatalogSelect,
    });

    if (!model) return null;

    const maintenanceRules = await prisma.maintenanceRule.findMany({
      where: {
        OR: [
          { modelId: null },
          { modelId: model.id },
        ],
      },
      select: maintenanceRuleSelect,
      orderBy: [
        { priority: "asc" },
        { intervalMiles: "asc" },
      ],
      take: 6,
    });

    return { model, maintenanceRules };
  },
  ["model-page-catalog-data-v1"],
  { revalidate: 86_400, tags: ["make-model-catalog", "model-page-catalog"] },
);

export type ModelPageCatalogData = NonNullable<Awaited<ReturnType<typeof getModelPageCatalogData>>>;
