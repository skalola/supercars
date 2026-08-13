import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

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

export const getMakeModelCatalogOptions = unstable_cache(
  async () => {
  const makes = await prisma.make.findMany({
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
    orderBy: [
      { region: "asc" },
      { name: "asc" },
    ],
  });

  const makeOptions: MakeOption[] = makes.map((make) => ({
    id: make.id,
    name: make.name.trim(),
    slug: make.slug,
    region: make.region,
    logoUrl: make.logoUrl,
  }));

  const modelOptions: ModelOption[] = makes.flatMap((make) => {
    const mappedMake = makeOptions.find((option) => option.id === make.id);
    if (!mappedMake) return [];

    return make.models.map((model) => ({
      id: model.id,
      name: model.name.trim(),
      slug: model.slug,
      makeId: model.makeId,
      make: mappedMake,
    }));
  });

  return {
    makes: makeOptions,
    models: modelOptions,
  };
  },
  ["make-model-catalog-options-v1"],
  { revalidate: 86_400, tags: ["make-model-catalog"] }
);

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
      models: make.models.map((model) => ({
        ...model,
        name: model.name.trim(),
      })),
    };
  },
  ["catalog-make-with-models-v1"],
  { revalidate: 86_400, tags: ["make-model-catalog"] }
);
