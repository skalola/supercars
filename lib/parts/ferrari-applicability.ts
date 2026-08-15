import type { FerrariComponentSeed } from "@/lib/parts/ferrari-component-library";

export type FerrariApplicabilityStatus = "APPLICABLE" | "NOT_APPLICABLE" | "YEAR_DEPENDENT" | "VARIANT_DEPENDENT";
export type FerrariApplicabilityConfidence = "HIGH" | "MEDIUM" | "LOW";
export type FerrariAspiration = "NATURALLY_ASPIRATED" | "TURBOCHARGED" | "SUPERCHARGED" | "MIXED" | "UNKNOWN";
export type FerrariElectrification = "COMBUSTION" | "HYBRID" | "ELECTRIC" | "MIXED" | "UNKNOWN";
export type FerrariTransmission = "MANUAL" | "AUTOMATED" | "MIXED" | "UNKNOWN";

export type FerrariModelApplicabilityInput = {
  name?: string | null;
  productionStartYear: number | null;
  productionEndYear: number | null;
  engine: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  bodyStyle?: string | null;
  category?: string | null;
  variantCount?: number;
};

export type FerrariComponentRequirements = {
  aspiration: "TURBOCHARGED" | null;
  electrification: "HYBRID" | null;
  transmission: "AUTOMATED" | null;
  minimumYear: number | null;
};

export type FerrariApplicabilityEvaluation = {
  status: FerrariApplicabilityStatus;
  confidence: FerrariApplicabilityConfidence;
  publiclyApplicable: boolean;
  reason: string;
  source: "SUPERCARDASH_COMPONENT_RULE_V1";
  requirements: FerrariComponentRequirements;
  profile: {
    aspiration: FerrariAspiration;
    electrification: FerrariElectrification;
    transmission: FerrariTransmission;
    drivetrain: string | null;
    bodyStyle: string | null;
  };
};

const TURBO_COMPONENT_PATTERN = /\b(turbocharger|charge pipes?|wastegate|blow[- ]off valve|boost controller|turbo heat shield|turbo inlet|downpipe|intercooler)\b/i;
const HYBRID_COMPONENT_PATTERN = /\b(hybrid battery|hybrid control module|high[- ]voltage)\b/i;
const AUTOMATED_COMPONENT_PATTERN = /\b(tcu tune|transmission controller|paddle shifter)\b/i;
const MODERN_COMPONENT_PATTERN = /\b(ecu|tcu|piggyback|power module|control module|infotainment|tpms|ride height sensor|steering sensor|mass air sensor)\b/i;

export function deriveFerrariComponentRequirements(component: FerrariComponentSeed): FerrariComponentRequirements {
  return {
    aspiration: component.turboOnly || TURBO_COMPONENT_PATTERN.test(component.name) ? "TURBOCHARGED" : null,
    electrification: component.hybridOnly || HYBRID_COMPONENT_PATTERN.test(component.name) ? "HYBRID" : null,
    transmission: AUTOMATED_COMPONENT_PATTERN.test(component.name) ? "AUTOMATED" : null,
    minimumYear: component.modernOnly || MODERN_COMPONENT_PATTERN.test(component.name) ? 1990 : null,
  };
}

export function evaluateFerrariComponentApplicability(
  component: FerrariComponentSeed,
  model: FerrariModelApplicabilityInput,
): FerrariApplicabilityEvaluation {
  const requirements = deriveFerrariComponentRequirements(component);
  const profile = buildFerrariModelApplicabilityProfile(model);
  const outcomes: Array<{ status: FerrariApplicabilityStatus; confidence: FerrariApplicabilityConfidence; reason: string }> = [];

  if (requirements.aspiration) outcomes.push(compareRequirement("turbocharged powertrain", profile.aspiration, "TURBOCHARGED"));
  if (requirements.electrification) outcomes.push(compareRequirement("hybrid powertrain", profile.electrification, "HYBRID"));
  if (requirements.transmission) outcomes.push(compareRequirement("automated transmission", profile.transmission, "AUTOMATED"));
  if (requirements.minimumYear != null) outcomes.push(compareMinimumYear(requirements.minimumYear, model.productionStartYear, model.productionEndYear));

  const decisive = selectMostRestrictive(outcomes);
  const status = decisive?.status ?? "APPLICABLE";
  return {
    status,
    confidence: decisive?.confidence ?? "HIGH",
    publiclyApplicable: status === "APPLICABLE",
    reason: decisive?.reason ?? "No model-specific constraint applies to this component.",
    source: "SUPERCARDASH_COMPONENT_RULE_V1",
    requirements,
    profile,
  };
}

export function buildFerrariModelApplicabilityProfile(model: FerrariModelApplicabilityInput) {
  return {
    aspiration: inferAspiration(model.engine),
    electrification: inferElectrification(model.engine, model.category),
    transmission: inferTransmission(model.transmission),
    drivetrain: normalizeOptional(model.drivetrain),
    bodyStyle: normalizeOptional(model.bodyStyle),
  };
}

function compareRequirement<T extends string>(label: string, actual: T, required: T) {
  if (actual === required) return { status: "APPLICABLE", confidence: "HIGH", reason: `Model evidence confirms the required ${label}.` } as const;
  if (actual === "MIXED") return { status: "VARIANT_DEPENDENT", confidence: "MEDIUM", reason: `The model family contains variants with different ${label} configurations.` } as const;
  if (actual === "UNKNOWN") return { status: "VARIANT_DEPENDENT", confidence: "LOW", reason: `The model catalog does not confirm the required ${label}.` } as const;
  return { status: "NOT_APPLICABLE", confidence: "HIGH", reason: `Model evidence conflicts with the required ${label}.` } as const;
}

function compareMinimumYear(minimumYear: number, startYear: number | null, endYear: number | null) {
  if (startYear != null && startYear >= minimumYear) {
    return { status: "APPLICABLE", confidence: "HIGH", reason: `Production begins in ${startYear}, after the ${minimumYear} technology threshold.` } as const;
  }
  if (endYear != null && endYear < minimumYear) {
    return { status: "NOT_APPLICABLE", confidence: "HIGH", reason: `Production ended in ${endYear}, before the ${minimumYear} technology threshold.` } as const;
  }
  return { status: "YEAR_DEPENDENT", confidence: startYear == null && endYear == null ? "LOW" : "MEDIUM", reason: `Applicability depends on whether the vehicle year is ${minimumYear} or newer.` } as const;
}

function selectMostRestrictive(outcomes: Array<{ status: FerrariApplicabilityStatus; confidence: FerrariApplicabilityConfidence; reason: string }>) {
  const priority: Record<FerrariApplicabilityStatus, number> = {
    NOT_APPLICABLE: 4,
    VARIANT_DEPENDENT: 3,
    YEAR_DEPENDENT: 2,
    APPLICABLE: 1,
  };
  return outcomes.sort((left, right) => priority[right.status] - priority[left.status])[0];
}

function inferAspiration(engine: string | null): FerrariAspiration {
  const value = normalizeOptional(engine);
  if (!value) return "UNKNOWN";
  const turbo = /\btwin[- ]turbo|\bturbo(?:charged)?\b/i.test(value);
  const supercharged = /\bsupercharged\b/i.test(value);
  const naturallyAspirated = /\bnaturally aspirated\b|\bna\b/i.test(value);
  const multipleEngines = value.includes("/");
  if (multipleEngines && (turbo || supercharged)) return "MIXED";
  if (turbo) return "TURBOCHARGED";
  if (supercharged) return "SUPERCHARGED";
  if (naturallyAspirated) return "NATURALLY_ASPIRATED";
  return "UNKNOWN";
}

function inferElectrification(engine: string | null, category: string | null | undefined): FerrariElectrification {
  const value = `${engine ?? ""} ${category ?? ""}`.trim();
  if (!value) return "UNKNOWN";
  const hybrid = /\bhybrid\b|plug[- ]in/i.test(value);
  const electric = /\belectric\b|\bev\b/i.test(value);
  if (hybrid && electric) return "MIXED";
  if (hybrid) return "HYBRID";
  if (electric) return "ELECTRIC";
  return engine ? "COMBUSTION" : "UNKNOWN";
}

function inferTransmission(transmission: string | null | undefined): FerrariTransmission {
  const value = normalizeOptional(transmission);
  if (!value) return "UNKNOWN";
  const manual = /\bmanual\b/i.test(value);
  const automated = /dual[- ]clutch|automatic|automated manual|\bf1\b/i.test(value);
  if (manual && automated) return "MIXED";
  if (automated) return "AUTOMATED";
  if (manual) return "MANUAL";
  return "UNKNOWN";
}

function normalizeOptional(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || null;
}
