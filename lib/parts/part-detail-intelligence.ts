import { parsePerformanceNumber } from "@/lib/parts/performance";

export const PART_RECOMMENDATION_STATUSES = [
  "RECOMMENDED",
  "OPTIONAL",
  "ALREADY_INSTALLED",
  "ALREADY_INCLUDED_IN_CONFIGURATION",
  "REDUNDANT",
  "REQUIRES_SUPPORTING_MOD",
  "NOT_RECOMMENDED",
  "INCOMPATIBLE",
  "UNKNOWN",
] as const;

export type PartRecommendationStatus = typeof PART_RECOMMENDATION_STATUSES[number];
export type PartTypeRelationshipKind = "REQUIRES" | "RECOMMENDS" | "CONFLICTS" | "INCLUDES" | "REDUNDANT_WITH";

export type PartTypeDescriptor = {
  id: string;
  name: string;
  slug: string;
  systemSlug: string;
  fitmentRisk?: string | null;
  performanceRelated?: boolean;
  applicability?: string | null;
};

export type InstalledPartDescriptor = {
  id: string;
  name: string;
  brandName?: string | null;
  componentTypeId?: string | null;
  componentTypeSlug?: string | null;
  systemSlug?: string | null;
  hpGain?: number | null;
  torqueGain?: number | null;
  includedPartTypeIds?: string[];
};

export type PartRelationshipDescriptor = {
  relationshipType: PartTypeRelationshipKind;
  partType: { id: string; name: string; slug: string };
  reason?: string | null;
};

export type PerformanceEvidenceDescriptor = {
  horsepowerGain?: number | null;
  torqueGain?: number | null;
  confidence?: string | null;
  source?: string | null;
};

export function getPartRecommendation(input: {
  partType: PartTypeDescriptor;
  installedParts: InstalledPartDescriptor[];
  requirements: PartRelationshipDescriptor[];
  includedBy: PartRelationshipDescriptor[];
  maintenanceDue?: boolean;
}) {
  const { partType, installedParts } = input;
  const installedTypeIds = new Set(installedParts.map((part) => part.componentTypeId).filter(Boolean));
  const exactInstall = installedParts.find((part) =>
    part.componentTypeId === partType.id || part.componentTypeSlug === partType.slug,
  );
  if (partType.applicability === "NOT_APPLICABLE") {
    return recommendation("INCOMPATIBLE", "This part type is not compatible with the selected vehicle configuration.");
  }
  if (exactInstall) {
    return recommendation("ALREADY_INSTALLED", `${formatInstalledPart(exactInstall)} is already recorded on this vehicle.`);
  }
  const containingConfiguration = installedParts.find((part) => part.includedPartTypeIds?.includes(partType.id));
  if (containingConfiguration) {
    return recommendation("ALREADY_INCLUDED_IN_CONFIGURATION", `${partType.name} is already included in ${formatInstalledPart(containingConfiguration)}. Its gain is not added again.`);
  }

  const conflicts = input.requirements.filter((item) => item.relationshipType === "CONFLICTS" && installedTypeIds.has(item.partType.id));
  if (conflicts.length > 0) {
    return recommendation("NOT_RECOMMENDED", conflicts[0].reason || `Conflicts with the installed ${conflicts[0].partType.name}.`);
  }
  const redundant = input.requirements.find((item) => item.relationshipType === "REDUNDANT_WITH" && installedTypeIds.has(item.partType.id));
  if (redundant) {
    return recommendation("REDUNDANT", redundant.reason || `The installed ${redundant.partType.name} already serves the same function.`);
  }
  const missingRequired = input.requirements.filter((item) => item.relationshipType === "REQUIRES" && !installedTypeIds.has(item.partType.id));
  if (missingRequired.length > 0) {
    return recommendation("REQUIRES_SUPPORTING_MOD", `${partType.name} requires ${joinNames(missingRequired.map((item) => item.partType.name))} before installation.`);
  }

  const sameSystem = installedParts.find((part) => part.systemSlug && part.systemSlug === partType.systemSlug);
  const recommendedWith = input.requirements.filter((item) => item.relationshipType === "RECOMMENDS");
  if (input.maintenanceDue) return recommendation("RECOMMENDED", `This service part is compatible and the related maintenance interval is due.`);
  if (partType.performanceRelated && (sameSystem || installedParts.length > 0)) {
    return recommendation("RECOMMENDED", `${partType.name} complements the vehicle's recorded build without duplicating an installed part type.`);
  }
  if (partType.fitmentRisk === "HIGH" || ["VARIANT_DEPENDENT", "YEAR_DEPENDENT"].includes(partType.applicability || "")) {
    return recommendation("UNKNOWN", "The part is plausible, but exact year or variant fitment must be verified before purchase.");
  }
  if (recommendedWith.length > 0) {
    return recommendation("OPTIONAL", `Compatible upgrade. It is commonly paired with ${joinNames(recommendedWith.map((item) => item.partType.name))}.`);
  }
  return recommendation("OPTIONAL", "Compatible with the selected vehicle context. No duplicate or conflicting modification is recorded.");
}

export function buildPerformanceProjection(input: {
  stockHorsepower?: string | number | null;
  stockTorque?: string | number | null;
  weight?: string | number | null;
  installedParts: InstalledPartDescriptor[];
  evidence: PerformanceEvidenceDescriptor[];
  suppressSelectedGain?: boolean;
}) {
  const stockHorsepower = parsePerformanceNumber(input.stockHorsepower);
  const stockTorque = parsePerformanceNumber(input.stockTorque);
  const weight = parsePerformanceNumber(input.weight);
  const currentHpGain = input.installedParts.reduce((total, part) => total + (part.hpGain || 0), 0);
  const currentTorqueGain = input.installedParts.reduce((total, part) => total + (part.torqueGain || 0), 0);
  const rankedEvidence = [...input.evidence]
    .filter((item) => item.horsepowerGain != null || item.torqueGain != null)
    .sort((left, right) => confidenceWeight(right.confidence) - confidenceWeight(left.confidence));
  const strongestConfidence = rankedEvidence[0]?.confidence || null;
  const strongest = rankedEvidence.filter((item) => confidenceWeight(item.confidence) === confidenceWeight(strongestConfidence));
  const hpValues = strongest.map((item) => item.horsepowerGain).filter(isNumber);
  const torqueValues = strongest.map((item) => item.torqueGain).filter(isNumber);
  const selectedHpMin = input.suppressSelectedGain || hpValues.length === 0 ? null : Math.min(...hpValues);
  const selectedHpMax = input.suppressSelectedGain || hpValues.length === 0 ? null : Math.max(...hpValues);
  const selectedTorqueMin = input.suppressSelectedGain || torqueValues.length === 0 ? null : Math.min(...torqueValues);
  const selectedTorqueMax = input.suppressSelectedGain || torqueValues.length === 0 ? null : Math.max(...torqueValues);
  const currentHp = stockHorsepower == null ? null : stockHorsepower + currentHpGain;
  const currentTorque = stockTorque == null ? null : stockTorque + currentTorqueGain;

  return {
    stock: {
      horsepower: stockHorsepower,
      torque: stockTorque,
      weight,
      powerToWeight: stockHorsepower && weight ? round((stockHorsepower / weight) * 1000, 1) : null,
    },
    currentBuild: {
      horsepowerMin: currentHp,
      horsepowerMax: currentHp,
      torqueMin: currentTorque,
      torqueMax: currentTorque,
    },
    selectedPartImpact: {
      horsepowerGainMin: selectedHpMin,
      horsepowerGainMax: selectedHpMax,
      torqueGainMin: selectedTorqueMin,
      torqueGainMax: selectedTorqueMax,
      confidence: strongestConfidence,
      source: strongest[0]?.source || null,
      numericalEvidenceAvailable: hpValues.length > 0 || torqueValues.length > 0,
      suppressedToPreventDoubleCount: Boolean(input.suppressSelectedGain),
    },
    projectedBuild: {
      horsepowerMin: currentHp == null || selectedHpMin == null ? currentHp : currentHp + selectedHpMin,
      horsepowerMax: currentHp == null || selectedHpMax == null ? currentHp : currentHp + selectedHpMax,
      torqueMin: currentTorque == null || selectedTorqueMin == null ? currentTorque : currentTorque + selectedTorqueMin,
      torqueMax: currentTorque == null || selectedTorqueMax == null ? currentTorque : currentTorque + selectedTorqueMax,
    },
  };
}

export function getQualitativePartEffects(partType: Pick<PartTypeDescriptor, "name" | "systemSlug">) {
  const name = `${partType.name} ${partType.systemSlug}`.toLowerCase();
  const effects = new Set<string>();
  const isFluidServiceFilter = /oil filter|fuel filter|transmission filter/.test(name);
  if (!isFluidServiceFilter && /air filter|intake|induction|airbox/.test(name)) { effects.add("Airflow"); effects.add("Throttle response"); }
  if (/exhaust|muffler|downpipe|header/.test(name)) { effects.add("Exhaust flow"); effects.add("Sound"); }
  if (/brake|rotor|pad/.test(name)) { effects.add("Braking consistency"); effects.add("Heat management"); }
  if (/spring|suspension|damper|coilover|sway/.test(name)) { effects.add("Handling"); effects.add("Body control"); }
  if (/wheel|tire/.test(name)) { effects.add("Grip"); effects.add("Steering response"); }
  if (/ecu|tune|controller/.test(name)) { effects.add("Power delivery"); effects.add("Response"); }
  if (/cool|radiator|intercooler/.test(name)) effects.add("Thermal management");
  if (isFluidServiceFilter || /service|maintenance/.test(name)) effects.add("Reliability");
  return [...effects].slice(0, 4);
}

function recommendation(status: PartRecommendationStatus, reason: string) {
  return { status, reason };
}

function formatInstalledPart(part: InstalledPartDescriptor) {
  return [part.brandName, part.name].filter(Boolean).join(" ");
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] || "supporting modifications";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function confidenceWeight(value?: string | null) {
  const weights: Record<string, number> = { VERIFIED: 4, HIGH: 4, MEDIUM: 3, LOW: 2, UNVERIFIED: 1 };
  return weights[(value || "UNVERIFIED").toUpperCase()] ?? 1;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, digits: number) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
