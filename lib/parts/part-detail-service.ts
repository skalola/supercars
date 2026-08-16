import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAvailableOffers } from "@/lib/parts/vehicle-parts-service";
import { buildVehiclePerformanceProfile } from "@/lib/parts/build-profile";
import { describeVehicleBuild, rankBuildAwarePartRecommendations } from "@/lib/parts/recommendations";
import { toBuildCategorySlug } from "@/lib/parts/category-system";
import {
  buildPerformanceProjection,
  getPartRecommendation,
  getQualitativePartEffects,
  type InstalledPartDescriptor,
  type PartRelationshipDescriptor,
  type PartTypeRelationshipKind,
} from "@/lib/parts/part-detail-intelligence";

export type PartDetailContextInput = {
  makeSlug: string;
  modelSlug: string;
  partTypeSlug: string;
  systemSlug?: string | null;
  year?: number | null;
  vehicleId?: string | null;
  userId?: string | null;
  offerPage?: number;
  refreshOffers?: boolean;
};

export async function getVehiclePartTypeDetail(input: PartDetailContextInput) {
  const mapping = await prisma.modelPartComponent.findFirst({
    where: {
      active: true,
      model: {
        slug: input.modelSlug,
        make: { slug: input.makeSlug, partsMarqueConfig: { is: { partsEnabled: true } } },
      },
      componentType: {
        active: true,
        slug: input.partTypeSlug,
        ...(input.systemSlug ? { category: { slug: input.systemSlug } } : {}),
      },
    },
    select: {
      id: true,
      applicability: true,
      notes: true,
      model: {
        select: {
          id: true,
          name: true,
          slug: true,
          productionStartYear: true,
          productionEndYear: true,
          make: { select: { id: true, name: true, slug: true, logoUrl: true } },
          spec: { select: { engine: true, horsepower: true, torque: true, weight: true, drivetrain: true, transmission: true } },
          images: {
            orderBy: [{ type: "asc" }, { createdAt: "asc" }],
            select: { url: true, attribution: true, attributionUrl: true },
            take: 1,
          },
          partComponents: {
            where: { active: true, applicability: { not: "NOT_APPLICABLE" }, componentType: { active: true } },
            select: {
              componentType: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  description: true,
                  category: { select: { name: true, slug: true } },
                },
              },
            },
            take: 160,
          },
        },
      },
      componentType: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          fitmentRisk: true,
          performanceRelated: true,
          category: { select: { id: true, name: true, slug: true } },
          outgoingRelationships: {
            where: { active: true },
            select: { relationshipType: true, reason: true, targetPartType: { select: { id: true, name: true, slug: true } } },
          },
          incomingRelationships: {
            where: { active: true, relationshipType: "INCLUDES" },
            select: { relationshipType: true, reason: true, sourcePartType: { select: { id: true, name: true, slug: true } } },
          },
          maintenanceLinks: {
            select: {
              required: true,
              maintenanceRule: { select: { serviceName: true, intervalMiles: true, intervalMonths: true, priority: true } },
            },
          },
          canonicalParts: {
            where: { status: { in: ["ACTIVE", "PUBLISHED"] } },
            select: {
              id: true,
              estimatedHpGain: true,
              estimatedTorqueGain: true,
              gainBasis: true,
              performanceEvidence: {
                where: { active: true },
                select: { horsepowerGain: true, torqueGain: true, confidence: true, sourceName: true },
                orderBy: { verifiedAt: "desc" },
                take: 12,
              },
              performanceConfigurations: {
                where: { active: true },
                select: {
                  modelId: true,
                  yearStart: true,
                  yearEnd: true,
                  horsepowerGain: true,
                  torqueGain: true,
                  confidence: true,
                  supportingMods: true,
                  evidence: { select: { sourceName: true } },
                },
                take: 25,
              },
            },
            take: 30,
          },
        },
      },
      applicabilityRules: {
        where: { active: true },
        select: { applicability: true, yearStart: true, yearEnd: true, confidence: true, source: true, notes: true },
        take: 25,
      },
    },
  });
  if (!mapping) return null;

  const selectedYear = input.year ?? mapping.model.productionEndYear ?? mapping.model.productionStartYear;
  const vehicle = input.vehicleId && input.userId
    ? await getOwnedVehicle(input.vehicleId, input.userId, mapping.model.id)
    : null;
  const installedParts = vehicle ? toInstalledPartDescriptors(vehicle, mapping.componentType) : [];
  const relationships: PartRelationshipDescriptor[] = mapping.componentType.outgoingRelationships.flatMap((relationship) => {
    const relationshipType = normalizeRelationshipType(relationship.relationshipType);
    return relationshipType ? [{ relationshipType, partType: relationship.targetPartType, reason: relationship.reason }] : [];
  });
  const includedBy = mapping.componentType.incomingRelationships.map((relationship) => ({
    relationshipType: "INCLUDES" as const,
    partType: relationship.sourcePartType,
    reason: relationship.reason,
  }));
  markIncludedConfigurations(installedParts, includedBy, mapping.componentType.id, vehicle);

  const applicability = resolveApplicability(mapping.applicability, mapping.applicabilityRules, selectedYear);
  const recommendation = getPartRecommendation({
    partType: {
      id: mapping.componentType.id,
      name: mapping.componentType.name,
      slug: mapping.componentType.slug,
      systemSlug: mapping.componentType.category.slug,
      fitmentRisk: mapping.componentType.fitmentRisk,
      performanceRelated: mapping.componentType.performanceRelated,
      applicability: applicability.status,
    },
    installedParts,
    requirements: relationships,
    includedBy,
    maintenanceDue: isMaintenanceDue(
      mapping.componentType.maintenanceLinks,
      vehicle?.mileage ?? null,
      vehicle?.serviceRecords ?? [],
    ),
  });
  const suppressSelectedGain = ["ALREADY_INSTALLED", "ALREADY_INCLUDED_IN_CONFIGURATION", "REDUNDANT", "INCOMPATIBLE"].includes(recommendation.status);
  const evidence = getApplicableEvidence(mapping.componentType.canonicalParts, mapping.model.id, selectedYear);
  const performance = buildPerformanceProjection({
    stockHorsepower: vehicle?.engineHP || mapping.model.spec?.horsepower,
    stockTorque: mapping.model.spec?.torque,
    weight: mapping.model.spec?.weight,
    installedParts,
    evidence,
    suppressSelectedGain,
  });
  const buildRecommendationParts = toBuildRecommendationParts(installedParts);
  const recommendationVehicle = {
    engine: vehicle?.engine || mapping.model.spec?.engine,
    transmission: vehicle?.transmission || mapping.model.spec?.transmission,
    trim: vehicle?.trim,
    drivetrain: vehicle?.drivetrain || mapping.model.spec?.drivetrain,
    stockHorsepower: vehicle?.engineHP || mapping.model.spec?.horsepower,
    stockTorque: mapping.model.spec?.torque,
  };
  const installedTypeIds = new Set(installedParts.map((part) => part.componentTypeId).filter(Boolean));
  const nextUpgrade = rankBuildAwarePartRecommendations({
    candidates: mapping.model.partComponents
      .filter((candidate) => !installedTypeIds.has(candidate.componentType.id))
      .map(({ componentType }) => ({
        id: componentType.id,
        name: componentType.name,
        description: componentType.description,
        estimatedHpGain: null,
        estimatedTorqueGain: null,
        gainBasis: null,
        category: componentType.category,
        compatibility: [{ makeId: mapping.model.make.id, modelId: mapping.model.id }],
        partTypeSlug: componentType.slug,
      })),
    installedParts: buildRecommendationParts,
    vehicle: recommendationVehicle,
    limit: 1,
  })[0] || null;
  const buildProfile = buildVehiclePerformanceProfile(recommendationVehicle, buildRecommendationParts);
  const buildAssessment = describeVehicleBuild(
    buildProfile,
    nextUpgrade ? toBuildCategorySlug(nextUpgrade.category.slug, `${nextUpgrade.name} ${nextUpgrade.description || ""}`) : null,
  );

  const offerPayload = await getAvailableOffers({
    makeSlug: mapping.model.make.slug,
    modelSlug: mapping.model.slug,
    componentSlug: mapping.componentType.slug,
    categorySlug: mapping.componentType.category.slug,
    year: selectedYear,
    page: input.offerPage,
    ...(input.refreshOffers ? { forceRefresh: true } : {}),
  });
  const offers = offerPayload?.offers ?? [];
  const groupedOffers = groupPartOffers(offers);

  return {
    partType: {
      id: mapping.componentType.id,
      name: mapping.componentType.name,
      slug: mapping.componentType.slug,
      description: mapping.componentType.description,
      system: mapping.componentType.category,
      fitmentRisk: mapping.componentType.fitmentRisk,
      performanceRelated: mapping.componentType.performanceRelated,
      qualitativeEffects: getQualitativePartEffects({ name: mapping.componentType.name, systemSlug: mapping.componentType.category.slug }),
    },
    vehicle: {
      id: vehicle?.id ?? null,
      vin: vehicle?.vin ?? null,
      exactOwnedVehicle: Boolean(vehicle),
      year: vehicle?.year ?? selectedYear,
      make: mapping.model.make,
      model: { id: mapping.model.id, name: mapping.model.name, slug: mapping.model.slug },
      variant: vehicle?.trim ?? null,
      engine: vehicle?.engine || mapping.model.spec?.engine || null,
      transmission: vehicle?.transmission || mapping.model.spec?.transmission || null,
      drivetrain: vehicle?.drivetrain || mapping.model.spec?.drivetrain || null,
      mileage: vehicle?.mileage ?? null,
      imageUrl: vehicle?.imageUrl || mapping.model.images[0]?.url || null,
      imageAttribution: vehicle ? null : mapping.model.images[0]?.attribution || null,
      imageAttributionUrl: vehicle ? null : mapping.model.images[0]?.attributionUrl || null,
    },
    currentBuild: {
      stage: installedParts.length === 0 ? "STOCK" : "MODIFIED",
      installedParts: installedParts.map((part) => ({
        id: part.id,
        name: part.name,
        brandName: part.brandName,
        componentTypeId: part.componentTypeId,
        componentTypeSlug: part.componentTypeSlug,
        systemSlug: part.systemSlug,
        hpGain: part.hpGain,
        torqueGain: part.torqueGain,
      })),
    },
    compatibility: {
      status: applicability.status,
      label: getFitmentLabel(applicability.status, mapping.componentType.fitmentRisk),
      confidence: applicability.confidence,
      source: applicability.source,
      reason: applicability.reason,
      verifyBeforePurchase: mapping.componentType.fitmentRisk === "HIGH" || applicability.status !== "APPLICABLE",
    },
    recommendation,
    buildGuidance: {
      stage: buildProfile.stage,
      strength: buildAssessment.strength,
      weakness: buildAssessment.weakness,
      nextUpgrade: nextUpgrade ? {
        id: nextUpgrade.id,
        name: nextUpgrade.name,
        systemName: nextUpgrade.category.name,
        systemSlug: nextUpgrade.category.slug,
        reason: nextUpgrade.recommendationReason,
        href: getNextUpgradePath({
          makeSlug: mapping.model.make.slug,
          modelSlug: mapping.model.slug,
          partTypeSlug: nextUpgrade.partTypeSlug,
          systemSlug: nextUpgrade.category.slug,
          year: selectedYear,
          vehicleId: vehicle?.id,
        }),
      } : null,
    },
    performance,
    relationships: {
      requires: relationships.filter((item) => item.relationshipType === "REQUIRES"),
      recommendedWith: relationships.filter((item) => item.relationshipType === "RECOMMENDS"),
      conflictsWith: relationships.filter((item) => item.relationshipType === "CONFLICTS"),
      includedBy,
    },
    maintenance: mapping.componentType.maintenanceLinks,
    availableAt: groupedOffers,
    offerSummary: {
      rawOfferCount: offers.length,
      productCount: groupedOffers.length,
      providerCount: new Set(offers.map((offer) => offer.provider)).size,
      cache: offerPayload?.cache ?? null,
      pagination: offerPayload?.pagination ?? {
        page: 1,
        pageSize: 5,
        hasPrevious: false,
        hasMore: false,
      },
    },
  };
}

async function getOwnedVehicle(vehicleId: string, userId: string, modelId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, ownerId: userId, modelId },
    select: {
      id: true,
      vin: true,
      year: true,
      trim: true,
      engine: true,
      transmission: true,
      drivetrain: true,
      engineHP: true,
      mileage: true,
      profile: { select: { currentMileage: true } },
      photos: { orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }], select: { filePath: true }, take: 1 },
      images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { url: true }, take: 1 },
      installedParts: {
        where: { installStatus: "INSTALLED" },
        select: {
          id: true,
          customName: true,
          customBrandName: true,
          hpGainOverride: true,
          torqueGainOverride: true,
          componentTypeId: true,
          componentType: { select: { slug: true, category: { select: { slug: true } } } },
          category: { select: { slug: true } },
          part: {
            select: {
              name: true,
              estimatedHpGain: true,
              estimatedTorqueGain: true,
              canonicalComponent: { select: { id: true, slug: true, category: { select: { slug: true } } } },
              brand: { select: { name: true } },
              performanceConfigurations: { where: { active: true }, select: { supportingMods: true }, take: 10 },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      },
      modifications: {
        where: { catalogInstall: null },
        select: { id: true, name: true, brand: true },
        orderBy: { createdAt: "asc" },
        take: 100,
      },
      serviceRecords: {
        orderBy: { serviceDate: "desc" },
        select: { serviceDate: true, mileage: true, description: true },
        take: 100,
      },
    },
  });
  if (!vehicle) return null;
  return {
    ...vehicle,
    mileage: vehicle.profile?.currentMileage ?? vehicle.mileage,
    imageUrl: vehicle.photos[0]?.filePath || vehicle.images[0]?.url || null,
  };
}

type OwnedVehicle = NonNullable<Awaited<ReturnType<typeof getOwnedVehicle>>>;

function toInstalledPartDescriptors(vehicle: OwnedVehicle, selectedPartType: { id: string; slug: string; name: string; category: { slug: string } }) {
  const catalogParts: InstalledPartDescriptor[] = vehicle.installedParts.map((installed) => ({
    id: installed.id,
    name: installed.part?.name || installed.customName || "Recorded modification",
    brandName: installed.part?.brand.name || installed.customBrandName,
    componentTypeId: installed.componentTypeId || installed.part?.canonicalComponent?.id,
    componentTypeSlug: installed.componentType?.slug || installed.part?.canonicalComponent?.slug,
    systemSlug: installed.componentType?.category.slug || installed.part?.canonicalComponent?.category.slug || installed.category?.slug,
    hpGain: installed.hpGainOverride ?? installed.part?.estimatedHpGain,
    torqueGain: installed.torqueGainOverride ?? installed.part?.estimatedTorqueGain,
    includedPartTypeIds: configurationIncludes(installed.part?.performanceConfigurations, selectedPartType) ? [selectedPartType.id] : [],
  }));
  const manualParts: InstalledPartDescriptor[] = vehicle.modifications.map((modification) => ({
    id: modification.id,
    name: modification.name,
    brandName: modification.brand,
    componentTypeId: textMatchesPartType(modification.name, selectedPartType) ? selectedPartType.id : null,
    componentTypeSlug: textMatchesPartType(modification.name, selectedPartType) ? selectedPartType.slug : null,
    systemSlug: null,
  }));
  return [...catalogParts, ...manualParts];
}

function markIncludedConfigurations(
  installedParts: InstalledPartDescriptor[],
  includedBy: PartRelationshipDescriptor[],
  selectedPartTypeId: string,
  vehicle: OwnedVehicle | null,
) {
  if (!vehicle) return;
  const sourceIds = new Set(includedBy.map((item) => item.partType.id));
  for (const part of installedParts) {
    if (part.componentTypeId && sourceIds.has(part.componentTypeId)) {
      part.includedPartTypeIds = [...new Set([...(part.includedPartTypeIds || []), selectedPartTypeId])];
    }
  }
}

function configurationIncludes(configurations: Array<{ supportingMods: Prisma.JsonValue }> | undefined, selected: { slug: string; name: string }) {
  const text = JSON.stringify(configurations || []).toLowerCase();
  return text.includes(selected.slug.toLowerCase()) || text.includes(selected.name.toLowerCase());
}

function textMatchesPartType(value: string, selected: { slug: string; name: string }) {
  const text = normalize(value);
  const tokens = normalize(selected.name).split(" ").filter((token) => token.length > 2 && !["performance", "front", "rear"].includes(token));
  return tokens.length > 0 && tokens.every((token) => text.includes(token)) || text.includes(normalize(selected.slug));
}

function getApplicableEvidence(
  parts: Array<{
    estimatedHpGain: number | null;
    estimatedTorqueGain: number | null;
    gainBasis: string | null;
    performanceEvidence: Array<{ horsepowerGain: number | null; torqueGain: number | null; confidence: string; sourceName: string | null }>;
    performanceConfigurations: Array<{ modelId: string | null; yearStart: number | null; yearEnd: number | null; horsepowerGain: number | null; torqueGain: number | null; confidence: string; sourceName?: string | null; evidence: { sourceName: string | null } | null }>;
  }>,
  modelId: string,
  year: number | null,
) {
  return parts.flatMap((part) => {
    const configurations = part.performanceConfigurations
      .filter((configuration) => (!configuration.modelId || configuration.modelId === modelId)
        && (!year || (!configuration.yearStart || configuration.yearStart <= year) && (!configuration.yearEnd || configuration.yearEnd >= year)))
      .map((configuration) => ({
        horsepowerGain: configuration.horsepowerGain,
        torqueGain: configuration.torqueGain,
        confidence: configuration.confidence,
        source: configuration.evidence?.sourceName || "Performance configuration",
      }));
    const evidence = part.performanceEvidence.map((item) => ({
      horsepowerGain: item.horsepowerGain,
      torqueGain: item.torqueGain,
      confidence: item.confidence,
      source: item.sourceName,
    }));
    const legacy = part.estimatedHpGain != null || part.estimatedTorqueGain != null
      ? [{ horsepowerGain: part.estimatedHpGain, torqueGain: part.estimatedTorqueGain, confidence: part.gainBasis ? "MEDIUM" : "UNVERIFIED", source: part.gainBasis }]
      : [];
    return [...configurations, ...evidence, ...legacy];
  });
}

function resolveApplicability(
  fallback: string,
  rules: Array<{ applicability: string; yearStart: number | null; yearEnd: number | null; confidence: string; source: string | null; notes: string | null }>,
  year: number | null,
) {
  const rule = rules.find((item) => !year || (!item.yearStart || item.yearStart <= year) && (!item.yearEnd || item.yearEnd >= year));
  const rawStatus = rule?.applicability || fallback;
  const status = rawStatus === "STANDARD" ? "APPLICABLE" : rawStatus;
  return { status, confidence: rule?.confidence || (status === "APPLICABLE" ? "HIGH" : "UNVERIFIED"), source: rule?.source || "Vehicle applicability mapping", reason: rule?.notes || null };
}

function isMaintenanceDue(
  links: Array<{ maintenanceRule: { serviceName: string; intervalMiles: number | null; intervalMonths: number | null } }>,
  mileage: number | null,
  serviceRecords: Array<{ serviceDate: Date; mileage: number | null; description: string | null }>,
) {
  const now = Date.now();
  return links.some(({ maintenanceRule }) => {
    const serviceTokens = normalize(maintenanceRule.serviceName)
      .split(" ")
      .filter((token) => token.length > 2 && !["service", "replace", "replacement", "inspect", "inspection"].includes(token));
    const lastService = serviceRecords.find((record) => {
      const description = normalize(record.description || "");
      return serviceTokens.length > 0 && serviceTokens.some((token) => description.includes(token));
    });
    const milesDue = maintenanceRule.intervalMiles != null && mileage != null
      ? lastService?.mileage != null
        ? mileage - lastService.mileage >= maintenanceRule.intervalMiles
        : mileage >= maintenanceRule.intervalMiles
      : false;
    const monthsDue = maintenanceRule.intervalMonths != null && lastService
      ? now - lastService.serviceDate.getTime() >= maintenanceRule.intervalMonths * 30.4375 * 24 * 60 * 60 * 1000
      : false;
    return milesDue || monthsDue;
  });
}

export function groupPartOffers<T extends {
  id: string; provider: string; title: string; manufacturer: string | null; manufacturerPartNumber: string | null; oemPartNumber: string | null;
  priceCents: number | null; currency: string; qualityTier: string; imageUrl: string | null; condition: string | null; sellerName: string | null;
  sellerFeedbackPercentage: number | null; shippingCostCents: number | null; shippingCurrency: string | null; fitmentConfidence: string; buyUrl: string;
}>(offers: T[]) {
  const groups = new Map<string, T[]>();
  for (const offer of offers) {
    const identity = offer.manufacturerPartNumber || offer.oemPartNumber;
    const key = identity
      ? `${normalize(offer.manufacturer || "unknown")}:${normalize(identity)}`
      : `${normalize(offer.manufacturer || "unknown")}:${normalize(offer.title)}`;
    groups.set(key, [...(groups.get(key) || []), offer]);
  }
  return [...groups.values()].map((sellerOffers) => {
    const representative = sellerOffers[0];
    const priced = sellerOffers.filter((offer) => offer.priceCents != null);
    return {
      key: `${representative.provider}:${representative.id}`,
      brand: representative.manufacturer,
      productName: representative.title,
      manufacturerPartNumber: representative.manufacturerPartNumber,
      oemPartNumber: representative.oemPartNumber,
      qualityTier: representative.qualityTier,
      imageUrl: representative.imageUrl,
      fromPriceCents: priced.length ? Math.min(...priced.map((offer) => offer.priceCents as number)) : null,
      currency: representative.currency,
      sellerCount: sellerOffers.length,
      primaryOffer: representative,
      sellers: sellerOffers.map((offer) => ({
        id: offer.id,
        provider: offer.provider,
        sellerName: offer.sellerName,
        sellerFeedbackPercentage: offer.sellerFeedbackPercentage,
        priceCents: offer.priceCents,
        currency: offer.currency,
        condition: offer.condition,
        shippingCostCents: offer.shippingCostCents,
        shippingCurrency: offer.shippingCurrency,
        fitmentConfidence: offer.fitmentConfidence,
        buyUrl: offer.buyUrl,
      })),
    };
  });
}

function normalizeRelationshipType(value: string): PartTypeRelationshipKind | null {
  return ["REQUIRES", "RECOMMENDS", "CONFLICTS", "INCLUDES", "REDUNDANT_WITH"].includes(value) ? value as PartTypeRelationshipKind : null;
}

function getFitmentLabel(status: string, risk: string) {
  if (status === "NOT_APPLICABLE") return "Not Compatible";
  if (status === "VARIANT_DEPENDENT") return "Variant Dependent";
  if (status === "YEAR_DEPENDENT") return "Year Dependent";
  if (risk === "HIGH") return "Verify Fitment";
  return "Fits Your Vehicle";
}

function toBuildRecommendationParts(installedParts: InstalledPartDescriptor[]) {
  return installedParts.map((part) => {
    const category = part.systemSlug ? { name: titleFromSlug(part.systemSlug), slug: part.systemSlug } : null;
    return {
      hpGainOverride: part.hpGain,
      torqueGainOverride: part.torqueGain,
      category,
      part: category ? {
        name: part.name,
        estimatedHpGain: part.hpGain,
        estimatedTorqueGain: part.torqueGain,
        category,
      } : null,
    };
  });
}

function getNextUpgradePath(input: {
  makeSlug: string;
  modelSlug: string;
  partTypeSlug: string;
  systemSlug: string;
  year: number | null;
  vehicleId?: string | null;
}) {
  const params = new URLSearchParams({ system: input.systemSlug });
  if (input.year) params.set("year", String(input.year));
  if (input.vehicleId) params.set("vehicleId", input.vehicleId);
  return `/parts/vehicles/${input.makeSlug}/${input.modelSlug}/${input.partTypeSlug}?${params}`;
}

function titleFromSlug(value: string) {
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
