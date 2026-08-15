import { prisma } from "@/lib/prisma";
import { buildVehiclePerformanceProfile } from "./build-profile";
import type { CandidateEngineeringChange } from "./constraint-engine";
import {
  ENGINEERING_CONTRACT_VERSION,
  type EngineeringBuildRequest,
  type EngineeringConfidence,
  type EngineeringMeasurement,
  type VehicleEngineeringProfile,
} from "./engineering-contract";
import { partEngineeringEffectSchema } from "./part-effects";
import { optimizeEngineeringRecommendations } from "./recommendation-optimizer";
import { getVehicleEngineeringProfile } from "./vehicle-knowledge";

export type PartsEngineeringRecommendationSummary = {
  title: string;
  summary: string;
  href: string;
  limitingFactor: string;
  expectedBenefit: string;
  tradeoff: string;
  confidence: string;
  confidenceLevel: EngineeringConfidence;
  supportingRequirements: string[];
  warning: string | null;
  missingDataDisclosure: string | null;
};

export async function getPartsEngineeringRecommendation(input: {
  makeSlug: string;
  modelSlug: string;
  vehicleId?: string | null;
  userId?: string | null;
  excludeComponentTypeId?: string | null;
}): Promise<PartsEngineeringRecommendationSummary | null> {
  const model = await prisma.model.findFirst({
    where: { slug: input.modelSlug, make: { slug: input.makeSlug } },
    select: {
      id: true,
      makeId: true,
      productionStartYear: true,
      productionEndYear: true,
      spec: { select: { engine: true, horsepower: true, torque: true, weight: true, drivetrain: true, transmission: true } },
    },
  });
  if (!model) return null;

  const [storedProfile, componentTypes, ownedVehicle] = await Promise.all([
    getVehicleEngineeringProfile({ modelId: model.id }),
    prisma.partComponentType.findMany({
      where: {
        active: true,
        id: input.excludeComponentTypeId ? { not: input.excludeComponentTypeId } : undefined,
        performanceRelated: true,
        engineeringEffect: { is: { active: true } },
        modelMappings: { some: { active: true, applicability: { not: "NOT_APPLICABLE" }, modelId: model.id } },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        categoryId: true,
        category: { select: { name: true, slug: true } },
        engineeringEffect: {
          select: {
            contractVersion: true,
            primaryDimension: true,
            benefits: true,
            tradeoffs: true,
            dependencies: true,
            risks: true,
            buildIntentions: true,
            confidence: true,
            evidenceBasis: true,
          },
        },
      },
      orderBy: [{ category: { displayOrder: "asc" } }, { displayOrder: "asc" }, { name: "asc" }],
      take: 100,
    }),
    input.vehicleId && input.userId
      ? prisma.vehicle.findFirst({
          where: { id: input.vehicleId, ownerId: input.userId, modelId: model.id },
          select: {
            id: true,
            year: true,
            trim: true,
            mileage: true,
            engine: true,
            engineHP: true,
            turbo: true,
            transmission: true,
            drivetrain: true,
            profile: { select: { currentMileage: true } },
            installedParts: {
              where: { installStatus: "INSTALLED" },
              select: {
                hpGainOverride: true,
                torqueGainOverride: true,
                category: { select: { name: true, slug: true } },
                componentType: { select: { name: true, category: { select: { name: true, slug: true } } } },
                part: {
                  select: {
                    name: true,
                    estimatedHpGain: true,
                    estimatedTorqueGain: true,
                    category: { select: { name: true, slug: true } },
                  },
                },
              },
              take: 100,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  const recommendationVehicle = {
    engine: ownedVehicle?.engine || model.spec?.engine,
    transmission: ownedVehicle?.transmission || model.spec?.transmission,
    trim: ownedVehicle?.trim,
    drivetrain: ownedVehicle?.drivetrain || model.spec?.drivetrain,
    stockHorsepower: ownedVehicle?.engineHP || model.spec?.horsepower,
    stockTorque: model.spec?.torque,
    forcedInduction: ownedVehicle?.turbo,
  };
  const installedParts = (ownedVehicle?.installedParts ?? []).map((installed) => {
    const category = installed.componentType?.category || installed.part?.category || installed.category;
    return {
      hpGainOverride: installed.hpGainOverride,
      torqueGainOverride: installed.torqueGainOverride,
      category,
      part: category ? {
        name: installed.part?.name || installed.componentType?.name || "Recorded modification",
        estimatedHpGain: installed.part?.estimatedHpGain,
        estimatedTorqueGain: installed.part?.estimatedTorqueGain,
        category,
      } : null,
    };
  });
  const build = buildVehiclePerformanceProfile(recommendationVehicle, installedParts);
  const vehicleProfile = storedProfile?.profile ?? fallbackVehicleProfile({
    model,
    build,
    year: ownedVehicle?.year ?? model.productionEndYear ?? model.productionStartYear,
  });
  const candidates = componentTypes.flatMap((component): CandidateEngineeringChange[] => {
    if (!component.engineeringEffect) return [];
    const parsed = partEngineeringEffectSchema.safeParse(component.engineeringEffect);
    if (!parsed.success) return [];
    return [{
      componentTypeId: component.id,
      componentName: component.name,
      systemSlug: component.category.slug,
      estimatedHpGain: null,
      estimatedTorqueGain: null,
      priceCents: null,
      effect: parsed.data,
    }];
  });
  if (candidates.length === 0) return null;

  const currentMileage = ownedVehicle?.profile?.currentMileage ?? ownedVehicle?.mileage ?? null;
  const request: EngineeringBuildRequest = {
    intention: "STREET_BALANCED",
    constraints: currentMileage !== null && currentMileage >= 100_000
      ? [{ type: "HIGH_MILEAGE", enabled: true, numericLimit: null, unit: null, value: null }]
      : [],
    currentMileage,
    plannedUseFrequency: "WEEKLY",
  };
  const result = optimizeEngineeringRecommendations({ vehicle: vehicleProfile, build, request, candidates, limit: 1 });
  const top = result.ranked[0];
  if (!top) return null;
  const selectedComponent = componentTypes.find((item) => item.id === top.candidate.componentTypeId);
  if (!selectedComponent) return null;
  const explanation = top.evidenceExplanation;
  const params = new URLSearchParams({ system: top.candidate.systemSlug });
  const selectedYear = ownedVehicle?.year ?? model.productionEndYear ?? model.productionStartYear;
  if (selectedYear) params.set("year", String(selectedYear));
  if (ownedVehicle?.id) params.set("vehicleId", ownedVehicle.id);

  return {
    title: top.candidate.componentName,
    summary: explanation.whyThisUpgrade,
    href: `/parts/vehicles/${input.makeSlug}/${input.modelSlug}/${selectedComponent.slug}?${params}`,
    limitingFactor: title(top.recommendation.limitingFactor),
    expectedBenefit: explanation.claims[0]?.statement ?? "The expected effect is qualitative until exact part evidence is available.",
    tradeoff: explanation.tradeoffs[0] ?? "Installation and fitment must be verified for the exact vehicle.",
    confidence: explanation.confidence.label,
    confidenceLevel: explanation.confidence.level,
    supportingRequirements: explanation.supportingRequirements.slice(0, 3),
    warning: explanation.warnings[0] ?? null,
    missingDataDisclosure: explanation.missingDataDisclosure,
  };
}

function fallbackVehicleProfile(input: {
  model: {
    id: string;
    makeId: string;
    spec: { engine: string | null; horsepower: string | null; torque: string | null; weight: string | null; drivetrain: string | null; transmission: string | null } | null;
  };
  build: ReturnType<typeof buildVehiclePerformanceProfile>;
  year: number | null;
}): VehicleEngineeringProfile {
  const measurements = [
    measurement("POWER", parseNumber(input.model.spec?.horsepower), "hp"),
    measurement("TORQUE", parseNumber(input.model.spec?.torque), "lb-ft"),
    measurement("MASS", parseNumber(input.model.spec?.weight), "lb"),
  ].filter((item): item is EngineeringMeasurement => item !== null);
  return {
    contractVersion: ENGINEERING_CONTRACT_VERSION,
    makeId: input.model.makeId,
    modelId: input.model.id,
    variantId: null,
    year: input.year,
    engineCode: null,
    aspiration: input.build.aspiration,
    drivetrain: input.build.drivetrain,
    transmission: classifyTransmission(input.model.spec?.transmission),
    measurements,
    tires: null,
    brakes: null,
    thermal: null,
    evidence: [],
  };
}

function measurement(dimension: EngineeringMeasurement["dimension"], value: number | null, unit: EngineeringMeasurement["unit"]): EngineeringMeasurement | null {
  return value === null ? null : { dimension, value, minimum: null, maximum: null, unit, confidence: "LOW", evidenceIds: [], derivedFrom: [] };
}

function parseNumber(value?: string | null) {
  const parsed = Number(value?.replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function classifyTransmission(value?: string | null): VehicleEngineeringProfile["transmission"] {
  if (!value) return "UNKNOWN";
  if (/dual.?clutch|\bdct\b/i.test(value)) return "DCT";
  if (/cvt|continuously variable/i.test(value)) return "CVT";
  if (/manual|\bmt\b/i.test(value)) return "MANUAL";
  if (/automatic|\bat\b/i.test(value)) return "AUTOMATIC";
  if (/sequential/i.test(value)) return "SEQUENTIAL";
  if (/single.?speed/i.test(value)) return "SINGLE_SPEED";
  return "UNKNOWN";
}

function title(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
