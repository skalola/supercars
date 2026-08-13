import { auth } from "@/auth";
import { PartsStoreExplorer } from "@/components/parts/PartsStoreExplorer";
import { getPublicPartsStoreShell, queryPublicPartsStore } from "@/lib/parts/storefront";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

type PartsPageProps = {
  searchParams?: Promise<{ make?: string; model?: string }>;
};

export default async function PartsPage({ searchParams }: PartsPageProps) {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  const resolvedSearchParams = (await searchParams) || {};

  const [publicCatalog, garageCars, initialFilter] = await Promise.all([
    getPublicPartsStoreShellCached(),
    getGarageCars(userId),
    getInitialPartsFilter(resolvedSearchParams.make, resolvedSearchParams.model),
  ]);
  const requestedInitialPage = await queryPublicPartsStore({
    categoryId: publicCatalog.categoryRows[0]?.id,
    makeId: initialFilter.makeId || undefined,
    modelId: initialFilter.modelId || undefined,
  });
  const initialCategoryId = requestedInitialPage.total > 0
    ? publicCatalog.categoryRows[0]?.id || ""
    : publicCatalog.categoryRows.find((category) => requestedInitialPage.categoryCounts[category.id] > 0)?.id || "";
  const initialPage = initialCategoryId && initialCategoryId !== publicCatalog.categoryRows[0]?.id
    ? await queryPublicPartsStore({
        categoryId: initialCategoryId,
        makeId: initialFilter.makeId || undefined,
        modelId: initialFilter.modelId || undefined,
      })
    : requestedInitialPage;

  return (
    <PartsStoreExplorer
      categories={publicCatalog.categoryRows}
      brands={publicCatalog.brandRows}
      initialPage={initialPage}
      initialCategoryId={initialCategoryId}
      catalogNodeCount={publicCatalog.catalogNodeCount}
      garageCars={garageCars}
      fitmentMakes={publicCatalog.fitmentMakes}
      fitmentModels={publicCatalog.fitmentModels}
      initialMakeId={initialFilter.makeId}
      initialModelId={initialFilter.modelId}
    />
  );
}

const getPublicPartsStoreShellCached = unstable_cache(
  getPublicPartsStoreShell,
  ["public-parts-store-catalog-v2"],
  {
    // Admin catalog mutations invalidate this tag immediately. The fallback TTL
    // only covers out-of-band imports, so avoid refetching the full catalog hourly.
    revalidate: 86_400,
    tags: ["parts-catalog"],
  },
);

async function getInitialPartsFilter(makeSlug?: string, modelSlug?: string) {
  const normalizedMakeSlug = makeSlug?.trim();
  const normalizedModelSlug = modelSlug?.trim();

  if (normalizedModelSlug) {
    const model = await prisma.model.findFirst({
      where: {
        slug: normalizedModelSlug,
        ...(normalizedMakeSlug ? { make: { slug: normalizedMakeSlug } } : {}),
      },
      select: {
        id: true,
        makeId: true,
      },
    });

    if (model) {
      return {
        makeId: model.makeId,
        modelId: model.id,
      };
    }
  }

  if (normalizedMakeSlug) {
    const make = await prisma.make.findUnique({
      where: { slug: normalizedMakeSlug },
      select: { id: true },
    });

    if (make) {
      return {
        makeId: make.id,
        modelId: "",
      };
    }
  }

  return {
    makeId: "",
    modelId: "",
  };
}

async function getGarageCars(userId: string | undefined) {
  if (!userId) return [];

  const [claimedVehicles, savedVehicles] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        ownerId: userId,
        status: "CLAIMED",
      },
      select: {
        id: true,
        vin: true,
        year: true,
        trim: true,
        modelId: true,
        photos: {
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          select: { filePath: true },
          take: 1,
        },
        images: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: { url: true },
          take: 1,
        },
        model: {
          select: {
            name: true,
            makeId: true,
            make: {
              select: { name: true },
            },
            images: {
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              select: { url: true },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      take: 25,
    }),
    prisma.garageItem.findMany({
      where: { userId },
      select: {
        id: true,
        modelId: true,
        model: {
          select: {
            name: true,
            makeId: true,
            make: {
              select: { name: true },
            },
            images: {
              orderBy: [{ type: "asc" }, { createdAt: "asc" }],
              select: { url: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const claimedModelIds = new Set(claimedVehicles.map((vehicle) => vehicle.modelId));
  const claimedRows = claimedVehicles.map((vehicle) => ({
    id: `claimed:${vehicle.id}`,
    label: [
      vehicle.year,
      vehicle.model.make.name,
      vehicle.model.name,
      vehicle.trim,
    ].filter(Boolean).join(" "),
    detail: vehicle.vin ? `VIN ${vehicle.vin.slice(-6)}` : "Claimed",
    makeId: vehicle.model.makeId,
    modelId: vehicle.modelId,
    imageUrl: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || null,
  }));
  const savedRows = savedVehicles
    .filter((item) => !claimedModelIds.has(item.modelId))
    .map((item) => ({
      id: `saved:${item.id}`,
      label: `${item.model.make.name} ${item.model.name}`,
      detail: "Dream Garage",
      makeId: item.model.makeId,
      modelId: item.modelId,
      imageUrl: item.model.images[0]?.url || null,
    }));

  return [...claimedRows, ...savedRows].sort((a, b) => a.label.localeCompare(b.label));
}
