import {
  confidenceWeight,
  type EngineeringConfidence,
  type EngineeringEvidence,
  type EngineeringRecommendation,
  type EngineeringRequiredModelField,
  type PerformanceDimension,
  type VehicleEngineeringProfile,
} from "./engineering-contract";
import type { CandidateEngineeringChange, EngineeringConstraintAnalysis } from "./constraint-engine";

export const ENGINEERING_CLAIM_STATUSES = ["SOURCE_BACKED", "ESTIMATE", "QUALITATIVE", "UNKNOWN"] as const;
export type EngineeringClaimStatus = (typeof ENGINEERING_CLAIM_STATUSES)[number];

export type EngineeringExplanationClaim = {
  dimension: PerformanceDimension;
  statement: string;
  status: EngineeringClaimStatus;
  confidence: EngineeringConfidence;
  evidenceIds: string[];
};

export type EngineeringEvidenceReference = Pick<
  EngineeringEvidence,
  "id" | "sourceType" | "sourceName" | "sourceUrl" | "capturedAt" | "confidence" | "notes"
>;

export type RecommendationEvidenceExplanation = {
  headline: string;
  summary: string;
  whyThisUpgrade: string;
  claims: EngineeringExplanationClaim[];
  warnings: string[];
  tradeoffs: string[];
  supportingRequirements: string[];
  confidence: {
    level: EngineeringConfidence;
    label: string;
    explanation: string;
  };
  evidence: EngineeringEvidenceReference[];
  evidenceDisclosure: string;
  missingData: EngineeringRequiredModelField[];
  missingDataDisclosure: string | null;
  numericalClaimsVerified: boolean;
};

export function buildRecommendationEvidenceExplanation(input: {
  recommendation: EngineeringRecommendation;
  candidate: CandidateEngineeringChange;
  constraints: EngineeringConstraintAnalysis;
  vehicle: VehicleEngineeringProfile;
}): RecommendationEvidenceExplanation {
  const { recommendation, candidate, constraints, vehicle } = input;
  const evidenceIds = new Set([
    ...recommendation.evidenceIds,
    ...constraints.findings.flatMap((finding) => finding.evidenceIds),
    ...recommendation.expectedBenefits.flatMap((benefit) => benefit.measurement?.evidenceIds ?? []),
  ]);
  const evidence = [...vehicle.evidence, ...(candidate.performanceEvidence ?? [])]
    .filter((item) => evidenceIds.has(item.id))
    .filter((item, index, items) => items.findIndex((candidateItem) => candidateItem.id === item.id) === index)
    .sort((left, right) =>
      confidenceWeight(right.confidence) - confidenceWeight(left.confidence)
      || left.sourceName.localeCompare(right.sourceName),
    );
  const claims = recommendation.expectedBenefits.map((benefit) => benefitClaim(benefit, evidenceIds));
  const numericalClaims = claims.filter((claim) => recommendation.expectedBenefits.some(
    (benefit) => benefit.dimension === claim.dimension && benefit.measurement !== null,
  ));
  const numericalClaimsVerified = numericalClaims.length > 0
    && numericalClaims.every((claim) => claim.status === "SOURCE_BACKED" && confidenceWeight(claim.confidence) >= confidenceWeight("MEDIUM"));
  const warnings = dedupe([
    ...constraints.findings.filter((finding) => finding.severity !== "ADVISORY").map((finding) => finding.explanation),
    ...candidate.effect.risks.map((risk) => risk.summary),
  ]);
  const confidence = confidenceExplanation(recommendation.confidence, evidence.length, numericalClaims.length, numericalClaimsVerified);

  return {
    headline: `${candidate.componentName} is the next ${dimensionLabel(recommendation.limitingFactor)} upgrade to evaluate`,
    summary: recommendation.explanation,
    whyThisUpgrade: whyThisUpgrade(candidate, recommendation, constraints),
    claims,
    warnings,
    tradeoffs: dedupe(recommendation.tradeoffs),
    supportingRequirements: dedupe(recommendation.supportingRequirements),
    confidence,
    evidence,
    evidenceDisclosure: evidenceDisclosure(evidence, candidate, claims),
    missingData: recommendation.missingData,
    missingDataDisclosure: missingDataDisclosure(recommendation.missingData),
    numericalClaimsVerified,
  };
}

function benefitClaim(
  benefit: EngineeringRecommendation["expectedBenefits"][number],
  availableEvidenceIds: Set<string>,
): EngineeringExplanationClaim {
  const measurement = benefit.measurement;
  if (!measurement) {
    return {
      dimension: benefit.dimension,
      statement: benefit.summary,
      status: "QUALITATIVE",
      confidence: "LOW",
      evidenceIds: [],
    };
  }

  const evidenceIds = measurement.evidenceIds.filter((id) => availableEvidenceIds.has(id));
  const sourceBacked = evidenceIds.length > 0 && confidenceWeight(measurement.confidence) >= confidenceWeight("MEDIUM");
  return {
    dimension: benefit.dimension,
    statement: sourceBacked
      ? `${formatMeasurement(measurement.value, measurement.unit)} documented ${dimensionLabel(benefit.dimension)} change. ${benefit.summary}`
      : `${formatMeasurement(measurement.value, measurement.unit)} candidate estimate. ${benefit.summary}`,
    status: sourceBacked ? "SOURCE_BACKED" : "ESTIMATE",
    confidence: measurement.confidence,
    evidenceIds,
  };
}

function whyThisUpgrade(
  candidate: CandidateEngineeringChange,
  recommendation: EngineeringRecommendation,
  constraints: EngineeringConstraintAnalysis,
) {
  const matchingLoad = Object.values(constraints.loads).find((load) => load.dimension === recommendation.limitingFactor);
  if (matchingLoad?.level === "HIGH" || matchingLoad?.level === "MODERATE") {
    return `${matchingLoad.explanation} ${candidate.componentName} targets ${dimensionLabel(recommendation.limitingFactor)}, so it is evaluated before another isolated power increase.`;
  }
  return `${candidate.componentName} aligns with the current build goal and targets ${dimensionLabel(recommendation.limitingFactor)} without bypassing the recorded supporting-system checks.`;
}

function confidenceExplanation(
  level: EngineeringConfidence,
  sourceCount: number,
  numericalClaimCount: number,
  numericalClaimsVerified: boolean,
) {
  const labels: Record<EngineeringConfidence, string> = {
    VERIFIED: "Verified",
    HIGH: "High confidence",
    MEDIUM: "Moderate confidence",
    LOW: "Preliminary guidance",
    UNKNOWN: "Insufficient evidence",
  };
  let explanation: string;
  if (level === "UNKNOWN") {
    explanation = "The available records are not sufficient to support a vehicle-specific recommendation.";
  } else if (numericalClaimCount > 0 && !numericalClaimsVerified) {
    explanation = "The upgrade direction is based on structured engineering rules, but numerical gains remain estimates until matched to part- and vehicle-specific evidence.";
  } else if (sourceCount === 0) {
    explanation = "The recommendation uses the system-level engineering baseline; no directly referenced vehicle source is available for this claim.";
  } else {
    explanation = `The recommendation references ${sourceCount} supporting ${sourceCount === 1 ? "source" : "sources"} and applies the stated confidence conservatively.`;
  }
  return { level, label: labels[level], explanation };
}

function evidenceDisclosure(
  evidence: EngineeringEvidenceReference[],
  candidate: CandidateEngineeringChange,
  claims: EngineeringExplanationClaim[],
) {
  const hasEstimate = claims.some((claim) => claim.status === "ESTIMATE");
  if (evidence.length === 0) {
    return `No directly referenced vehicle source supports this recommendation yet. ${candidate.effect.evidenceBasis}`;
  }
  const sourceNames = dedupe(evidence.map((item) => item.sourceName));
  const sourceText = `Vehicle context references ${joinReadable(sourceNames)}.`;
  return hasEstimate
    ? `${sourceText} Any stated part gain remains an estimate until supported by exact-vehicle test or manufacturer evidence.`
    : sourceText;
}

function missingDataDisclosure(missing: EngineeringRequiredModelField[]) {
  if (missing.length === 0) return null;
  return `This assessment is limited because ${joinReadable(missing.map(fieldLabel))} ${missing.length === 1 ? "is" : "are"} not verified for this vehicle configuration.`;
}

function fieldLabel(field: EngineeringRequiredModelField) {
  const labels: Record<EngineeringRequiredModelField, string> = {
    engineCode: "engine code",
    aspiration: "aspiration type",
    horsepower: "stock horsepower",
    torque: "stock torque",
    weight: "vehicle weight",
    drivetrain: "drivetrain layout",
    transmission: "transmission type",
    tires: "tire specification",
    brakes: "brake specification",
    thermal: "cooling capacity",
  };
  return labels[field];
}

function formatMeasurement(value: number, unit: string) {
  return `${value > 0 ? "+" : ""}${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

function dimensionLabel(dimension: PerformanceDimension) {
  return dimension.toLowerCase().replaceAll("_", " ");
}

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function joinReadable(values: string[]) {
  if (values.length <= 1) return values[0] ?? "the required data";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}
