import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { compareCatalogNames, sortCatalogLabels } from "@/lib/makes/catalog-order";

export type MakeOption = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  logoUrl: string | null;
};

export type ModelOption = {
  id: string;
  name: string;
  slug: string;
  makeId: string;
  make: MakeOption;
};

export type ModelEditorOption = {
  id: string;
  name: string;
  makeId: string;
};

export type CatalogMakeSummary = MakeOption & {
  modelCount: number;
  modelPreviewNames: string[];
};

type CatalogMakeSummaryRow = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  logoUrl: string | null;
  modelCount: number;
  modelPreviewNames: string[];
};

export const getCatalogMakeNames = unstable_cache(
  async () => {
  const makes = await prisma.make.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });

  return makes.map((make) => make.name.trim()).filter(Boolean);
  },
  ["catalog-make-names-v1"],
  { revalidate: 86_400, tags: ["make-model-catalog"] }
);

export const getCatalogMakeOptions = unstable_cache(
  async () => {
    const makes = await prisma.make.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        region: true,
        logoUrl: true,
      },
      orderBy: [
        { region: "asc" },
        { name: "asc" },
      ],
    });

    return makes.map((make): MakeOption => ({
      ...make,
      name: make.name.trim(),
    }));
  },
  ["catalog-make-options-v1"],
  { revalidate: 86_400, tags: ["make-model-catalog"] }
);

export const getCatalogModelsByMakeIds = unstable_cache(
  async (makeIds: string[]): Promise<ModelEditorOption[]> => {
    if (makeIds.length === 0) return [];

    const models = await prisma.model.findMany({
      where: { makeId: { in: makeIds } },
      select: {
        id: true,
        name: true,
        makeId: true,
      },
      orderBy: [
        { make: { name: "asc" } },
        { name: "asc" },
      ],
    });

    return sortCatalogLabels(models.map((model) => ({
      ...model,
      name: model.name.trim(),
    })));
  },
  ["catalog-models-by-make-v2"],
  { revalidate: 86_400, tags: ["make-model-catalog"] },
);

export const getCatalogMakeSummaries = unstable_cache(
  async (): Promise<CatalogMakeSummary[]> => {
    const rows = await prisma.$queryRaw<CatalogMakeSummaryRow[]>(Prisma.sql`
      WITH ranked_models AS (
        SELECT
          model."makeId",
          model."name",
          ROW_NUMBER() OVER (
            PARTITION BY model."makeId"
            ORDER BY model."name" ASC
          ) AS model_rank,
          COUNT(*) OVER (PARTITION BY model."makeId")::int AS model_count
        FROM "Model" model
      )
      SELECT
        make."id",
        make."name",
        make."slug",
        make."region",
        make."logoUrl",
        COALESCE(MAX(ranked.model_count), 0)::int AS "modelCount",
        COALESCE(
          ARRAY_AGG(ranked."name" ORDER BY ranked."name" ASC)
            FILTER (WHERE ranked.model_rank <= 4),
          ARRAY[]::text[]
        ) AS "modelPreviewNames"
      FROM "Make" make
      LEFT JOIN ranked_models ranked ON ranked."makeId" = make."id"
      GROUP BY make."id", make."name", make."slug", make."region", make."logoUrl"
      ORDER BY make."region" ASC NULLS FIRST, make."name" ASC
    `);

    return rows.map((row) => ({
      ...row,
      name: row.name.trim(),
      modelPreviewNames: [...row.modelPreviewNames].sort(compareCatalogNames),
    }));
  },
  ["catalog-make-summaries-v2"],
  { revalidate: 86_400, tags: ["make-model-catalog"] },
);

export const getCatalogMakeWithModels = unstable_cache(
  async (slug: string) => {
    const make = await prisma.make.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        region: true,
        logoUrl: true,
        models: {
          select: {
            id: true,
            name: true,
            slug: true,
            makeId: true,
          },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!make) return null;

    return {
      ...make,
      name: make.name.trim(),
      models: sortCatalogLabels(make.models.map((model) => ({
        ...model,
        name: model.name.trim(),
      }))),
    };
  },
  ["catalog-make-with-models-v2"],
  { revalidate: 86_400, tags: ["make-model-catalog"] }
);
