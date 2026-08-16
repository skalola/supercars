import { auth } from "@/auth";
import { PartsTuningShop } from "@/components/parts/PartsTuningShop";
import { getPublicPartsStoreShell } from "@/lib/parts/storefront";
import { calculateModifiedPerformance } from "@/lib/parts/performance";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

type PartsPageProps = {
  searchParams?: Promise<{ make?: string; model?: string; selectVehicle?: string }>;
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

  return (
    <PartsTuningShop
      categories={publicCatalog.categoryRows}
      brands={publicCatalog.brandRows}
      garageCars={garageCars}
      fitmentMakes={publicCatalog.fitmentMakes}
      fitmentModels={publicCatalog.fitmentModels}
      initialMakeId={initialFilter.makeId}
      initialModelId={initialFilter.modelId}
      initialSelectorOpen={resolvedSearchParams.selectVehicle === "1"}
    />
  );
}

const getPublicPartsStoreShellCached = unstable_cache(
  getPublicPartsStoreShell,
  ["public-parts-store-catalog-v3"],
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
        engine: true,
        engineHP: true,
        turbo: true,
        transmission: true,
        drivetrain: true,
        installedParts: {
          where: { installStatus: "INSTALLED" },
          select: {
            hpGainOverride: true,
            torqueGainOverride: true,
            part: { select: { estimatedHpGain: true, estimatedTorqueGain: true } },
          },
        },
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
            slug: true,
            makeId: true,
            productionStartYear: true,
            productionEndYear: true,
            spec: {
              select: { engine: true, horsepower: true, torque: true, transmission: true, drivetrain: true, weight: true },
            },
            make: { select: { name: true, slug: true, logoUrl: true } },
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
            slug: true,
            makeId: true,
            productionStartYear: true,
            productionEndYear: true,
            spec: {
              select: { engine: true, horsepower: true, torque: true, transmission: true, drivetrain: true, weight: true },
            },
            make: { select: { name: true, slug: true, logoUrl: true } },
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
  const claimedRows = claimedVehicles.map((vehicle) => {
    const performance = calculateModifiedPerformance({
      stockHorsepower: vehicle.engineHP ?? vehicle.model.spec?.horsepower,
      stockTorque: vehicle.model.spec?.torque,
      installedParts: vehicle.installedParts,
    });
    return {
      id: `claimed:${vehicle.id}`,
      label: [vehicle.year, vehicle.model.make.name, vehicle.model.name, vehicle.trim].filter(Boolean).join(" "),
      detail: vehicle.vin ? `VIN ${vehicle.vin.slice(-6)}` : "Claimed",
      makeId: vehicle.model.makeId,
      modelId: vehicle.modelId,
      modelSlug: vehicle.model.slug,
      year: vehicle.year,
      imageUrl: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || vehicle.model.images[0]?.url || null,
      makeName: vehicle.model.make.name,
      makeSlug: vehicle.model.make.slug,
      makeLogoUrl: vehicle.model.make.logoUrl,
      modelName: vehicle.model.name,
      variant: vehicle.trim,
      engine: vehicle.engine ?? vehicle.model.spec?.engine,
      horsepower: performance.modifiedHorsepower,
      torque: performance.modifiedTorque,
      weight: vehicle.model.spec?.weight,
      drivetrain: vehicle.drivetrain ?? vehicle.model.spec?.drivetrain,
      transmission: vehicle.transmission ?? vehicle.model.spec?.transmission,
      aspiration: getAspiration(vehicle.turbo, vehicle.engine ?? vehicle.model.spec?.engine),
      buildStage: vehicle.installedParts.length > 0 ? "Current build" : "Stock specification",
      detailPath: `/vehicle/${vehicle.vin}`,
      exactOwnedVehicle: true,
    };
  });
  const savedRows = savedVehicles
    .filter((item) => !claimedModelIds.has(item.modelId))
    .map((item) => ({
      id: `saved:${item.id}`,
      label: `${item.model.make.name} ${item.model.name}`,
      detail: "Dream Garage",
      makeId: item.model.makeId,
      modelId: item.modelId,
      modelSlug: item.model.slug,
      year: item.model.productionEndYear ?? item.model.productionStartYear,
      imageUrl: item.model.images[0]?.url || null,
      makeName: item.model.make.name,
      makeSlug: item.model.make.slug,
      makeLogoUrl: item.model.make.logoUrl,
      modelName: item.model.name,
      variant: null,
      engine: item.model.spec?.engine,
      horsepower: item.model.spec?.horsepower,
      torque: item.model.spec?.torque,
      weight: item.model.spec?.weight,
      drivetrain: item.model.spec?.drivetrain,
      transmission: item.model.spec?.transmission,
      aspiration: getAspiration(null, item.model.spec?.engine),
      buildStage: "Stock specification",
      detailPath: `/make/${item.model.make.slug}/${item.model.slug}`,
      exactOwnedVehicle: false,
    }));

  return [...claimedRows, ...savedRows].sort((a, b) => a.label.localeCompare(b.label));
}

function getAspiration(forcedInduction?: string | null, engine?: string | null) {
  const value = `${forcedInduction ?? ""} ${engine ?? ""}`;
  if (/turbo|supercharg|forced induction/i.test(value)) return "Forced Induction";
  if (/naturally aspirated|\bN\/?A\b/i.test(value)) return "Naturally Aspirated";
  return null;
}
