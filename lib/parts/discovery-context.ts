import { prisma } from "@/lib/prisma";
import { canMaterializePartContext } from "@/lib/parts/discovery-contract";
import {
  applyApplicabilityOverride,
  evaluateUniversalPartApplicability,
} from "@/lib/parts/universal-applicability";

export type PartDiscoveryContextResult =
  | {
      ok: true;
      mappingId: string;
      created: boolean;
      applicability: ReturnType<typeof evaluateUniversalPartApplicability>;
      vehicle: { makeSlug: string; modelSlug: string };
      partType: { systemSlug: string; componentSlug: string };
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "NOT_APPLICABLE" | "MAPPING_DISABLED";
      message: string;
      applicability?: ReturnType<typeof evaluateUniversalPartApplicability>;
    };

export async function resolvePartDiscoveryContext(input: {
  makeSlug: string;
  modelSlug: string;
  systemSlug: string;
  componentSlug: string;
}): Promise<PartDiscoveryContextResult> {
  const [model, componentType] = await Promise.all([
    prisma.model.findFirst({
      where: { slug: input.modelSlug, make: { slug: input.makeSlug } },
      select: {
        id: true,
        name: true,
        slug: true,
        makeId: true,
        productionStartYear: true,
        productionEndYear: true,
        bodyStyle: true,
        make: { select: { name: true, slug: true } },
        spec: { select: { engine: true, transmission: true, drivetrain: true } },
        _count: { select: { variants: true } },
      },
    }),
    prisma.partComponentType.findFirst({
      where: {
        active: true,
        slug: input.componentSlug,
        category: { active: true, slug: input.systemSlug },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        fitmentRisk: true,
        category: { select: { slug: true } },
      },
    }),
  ]);

  if (!model || !componentType) {
    return { ok: false, code: "NOT_FOUND", message: "The selected vehicle or part type is not in the catalog." };
  }

  const overrides = await prisma.partApplicabilityOverride.findMany({
    where: {
      vehicleMakeId: model.makeId,
      partTypeId: componentType.id,
      active: true,
      OR: [{ vehicleModelId: model.id }, { vehicleModelId: null }],
    },
    select: { vehicleModelId: true, overrideStatus: true, reason: true, source: true },
  });
  const override = overrides.find((item) => item.vehicleModelId === model.id) ?? overrides.find((item) => item.vehicleModelId === null) ?? null;
  const applicability = applyApplicabilityOverride(evaluateUniversalPartApplicability({
    id: componentType.id,
    name: componentType.name,
    slug: componentType.slug,
    systemSlug: componentType.category.slug,
    fitmentRisk: componentType.fitmentRisk,
  }, {
    makeSlug: model.make.slug,
    modelSlug: model.slug,
    modelName: model.name,
    productionStartYear: model.productionStartYear,
    productionEndYear: model.productionEndYear,
    engine: model.spec?.engine,
    transmission: model.spec?.transmission,
    drivetrain: model.spec?.drivetrain,
    bodyStyle: model.bodyStyle,
    variantCount: model._count.variants,
  }), override ? {
    overrideStatus: normalizeOverrideStatus(override.overrideStatus),
    reason: override.reason,
    source: override.source,
  } : null);

  if (!canMaterializePartContext(applicability)) {
    return {
      ok: false,
      code: "NOT_APPLICABLE",
      message: applicability.reason,
      applicability,
    };
  }

  const existing = await prisma.modelPartComponent.findUnique({
    where: { modelId_componentTypeId: { modelId: model.id, componentTypeId: componentType.id } },
    select: { id: true, active: true, applicability: true },
  });
  if (existing && !existing.active) {
    return { ok: false, code: "MAPPING_DISABLED", message: "This vehicle and part combination has been disabled pending review." };
  }

  const mapping = existing ?? await prisma.modelPartComponent.create({
    data: {
      modelId: model.id,
      componentTypeId: componentType.id,
      applicability: applicability.status,
      notes: `[${applicability.source}] ${applicability.reason}`,
      active: true,
      catalogGapStatus: "ON_DEMAND",
    },
    select: { id: true, active: true, applicability: true },
  }).catch(async (error: unknown) => {
    const concurrent = await prisma.modelPartComponent.findUnique({
      where: { modelId_componentTypeId: { modelId: model.id, componentTypeId: componentType.id } },
      select: { id: true, active: true, applicability: true },
    });
    if (concurrent) return concurrent;
    throw error;
  });

  return {
    ok: true,
    mappingId: mapping.id,
    created: !existing,
    applicability,
    vehicle: { makeSlug: model.make.slug, modelSlug: model.slug },
    partType: { systemSlug: componentType.category.slug, componentSlug: componentType.slug },
  };
}

function normalizeOverrideStatus(value: string): "APPLICABLE" | "NOT_APPLICABLE" | "VARIANT_DEPENDENT" | "YEAR_DEPENDENT" {
  if (value === "APPLICABLE" || value === "NOT_APPLICABLE" || value === "VARIANT_DEPENDENT" || value === "YEAR_DEPENDENT") return value;
  return "VARIANT_DEPENDENT";
}
