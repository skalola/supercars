import {
  confidenceWeight,
  type BuildIntention,
  type EngineeringBuildRequest,
  type EngineeringConfidence,
  type EngineeringMeasurement,
  type EngineeringRecommendation,
  type PerformanceDimension,
  type VehicleEngineeringProfile,
} from "./engineering-contract";
import type { VehicleBuildProfile } from "./build-profile";
import {
  analyzeEngineeringConstraints,
  type CandidateEngineeringChange,
  type EngineeringConstraintAnalysis,
} from "./constraint-engine";
import { toBuildCategorySlug } from "./category-system";
import {
  buildRecommendationEvidenceExplanation,
  type RecommendationEvidenceExplanation,
} from "./evidence-explanation";

export type RecommendationScoreBreakdown = {
  limitingFactorFit: number;
  buildIntentionFit: number;
  usefulImprovement: number;
  reliability: number;
  costFit: number;
  confidence: number;
  supportingSystemPenalty: number;
  dataGapPenalty: number;
};

export type RankedEngineeringRecommendation = {
  candidate: CandidateEngineeringChange;
  recommendation: EngineeringRecommendation;
  constraints: EngineeringConstraintAnalysis;
  evidenceExplanation: RecommendationEvidenceExplanation;
  score: number;
  scoreBreakdown: RecommendationScoreBreakdown;
};

export type ExcludedEngineeringRecommendation = {
  candidate: CandidateEngineeringChange;
  constraints: EngineeringConstraintAnalysis;
  reasons: string[];
};

export type EngineeringOptimizationResult = {
  limitingFactor: PerformanceDimension;
  ranked: RankedEngineeringRecommendation[];
  excluded: ExcludedEngineeringRecommendation[];
};

const INTENTION_PRIORITIES: Record<BuildIntention, PerformanceDimension[]> = {
  STREET_BALANCED: ["RELIABILITY", "TRACTION", "BRAKING", "HANDLING", "THERMAL_CAPACITY", "POWER"],
  DAILY_DRIVER: ["RELIABILITY", "TRACTION", "BRAKING", "THERMAL_CAPACITY", "HANDLING", "POWER"],
  TRACK_DAY: ["BRAKING", "THERMAL_CAPACITY", "HANDLING", "TRACTION", "RELIABILITY", "POWER"],
  AUTOCROSS: ["HANDLING", "TRACTION", "BRAKING", "MASS", "POWER", "RELIABILITY"],
  DRAG: ["TRACTION", "DRIVETRAIN_CAPACITY", "POWER", "THERMAL_CAPACITY", "RELIABILITY", "MASS"],
  TOURING: ["RELIABILITY", "THERMAL_CAPACITY", "BRAKING", "TRACTION", "HANDLING", "POWER"],
  SHOW: ["AERODYNAMICS", "MASS", "HANDLING", "RELIABILITY", "TRACTION", "POWER"],
};

const SYSTEM_DIMENSIONS: Record<string, PerformanceDimension> = {
  cooling: "THERMAL_CAPACITY",
  brakes: "BRAKING",
  "wheels-tires": "TRACTION",
  drivetrain: "DRIVETRAIN_CAPACITY",
  "transmission-drivetrain": "DRIVETRAIN_CAPACITY",
  suspension: "HANDLING",
  "suspension-steering": "HANDLING",
  fueling: "RELIABILITY",
  "fuel-system": "RELIABILITY",
  "ecu-tuning": "RELIABILITY",
  "ecu-electronics": "RELIABILITY",
};

export function optimizeEngineeringRecommendations(input: {
  vehicle: VehicleEngineeringProfile;
  build: VehicleBuildProfile;
  request: EngineeringBuildRequest;
  candidates: CandidateEngineeringChange[];
  limit?: number;
}): EngineeringOptimizationResult {
  const { vehicle, build, request, candidates } = input;
  const limit = Math.max(0, input.limit ?? 5);
  const baseline = analyzeEngineeringConstraints({ vehicle, build, request });
  const limitingFactor = determineLimitingFactor(baseline, build, request.intention);
  const ranked: RankedEngineeringRecommendation[] = [];
  const excluded: ExcludedEngineeringRecommendation[] = [];

  for (const candidate of candidates) {
    const constraints = analyzeEngineeringConstraints({ vehicle, build, request, candidate });
    if (!constraints.canRecommend) {
      excluded.push({ candidate, constraints, reasons: constraints.hardIncompatibilities });
      continue;
    }

    const scoreBreakdown = scoreCandidate({ candidate, constraints, vehicle, build, request, limitingFactor });
    const score = Object.values(scoreBreakdown).reduce((total, value) => total + value, 0);
    const recommendation = buildRecommendation({ candidate, constraints, vehicle, limitingFactor });
    ranked.push({
      candidate,
      constraints,
      score,
      scoreBreakdown,
      recommendation,
      evidenceExplanation: buildRecommendationEvidenceExplanation({ recommendation, candidate, constraints, vehicle }),
    });
  }

  ranked.sort((left, right) =>
    right.score - left.score
    || confidenceWeight(right.recommendation.confidence) - confidenceWeight(left.recommendation.confidence)
    || left.candidate.componentName.localeCompare(right.candidate.componentName),
  );
  excluded.sort((left, right) => left.candidate.componentName.localeCompare(right.candidate.componentName));

  return { limitingFactor, ranked: ranked.slice(0, limit), excluded };
}

export function determineLimitingFactor(
  constraints: EngineeringConstraintAnalysis,
  build: VehicleBuildProfile,
  intention: BuildIntention,
): PerformanceDimension {
  const loads = Object.values(constraints.loads);
  const severity = { HIGH: 3, MODERATE: 2, LOW: 1, UNKNOWN: 0 } as const;
  const priority = INTENTION_PRIORITIES[intention];
  const stressed = loads
    .filter((load) => load.level === "HIGH" || load.level === "MODERATE")
    .sort((left, right) =>
      severity[right.level] - severity[left.level]
      || (right.ratio ?? 0) - (left.ratio ?? 0)
      || priority.indexOf(left.dimension) - priority.indexOf(right.dimension),
    )[0];
  if (stressed) return stressed.dimension;

  for (const system of build.supportNeeds) {
    const dimension = SYSTEM_DIMENSIONS[system];
    if (dimension) return dimension;
  }
  return priority[0];
}

function scoreCandidate(input: {
  candidate: CandidateEngineeringChange;
  constraints: EngineeringConstraintAnalysis;
  vehicle: VehicleEngineeringProfile;
  build: VehicleBuildProfile;
  request: EngineeringBuildRequest;
  limitingFactor: PerformanceDimension;
}): RecommendationScoreBreakdown {
  const { candidate, constraints, vehicle, build, request, limitingFactor } = input;
  const benefitDimensions = new Set(candidate.effect.benefits.map((benefit) => benefit.dimension));
  const intentionOrder = INTENTION_PRIORITIES[request.intention];
  const dimensionRank = intentionOrder.indexOf(candidate.effect.primaryDimension);
  const requiredMissing = constraints.findings.filter((item) => item.code.startsWith("MISSING_REQUIRED_")).length;
  const warnings = constraints.findings.filter((item) => item.severity === "WARNING").length;
  const riskCost = candidate.effect.risks.reduce((total, risk) => total + ({ LOW: 1, MEDIUM: 3, HIGH: 6 }[risk.severity]), 0);

  const usefulImprovement = usefulImprovementScore(candidate, vehicle, limitingFactor)
    - (build.installedCategories.has(toBuildCategorySlug(candidate.systemSlug, candidate.componentName)) ? 6 : 0);

  return {
    limitingFactorFit: benefitDimensions.has(limitingFactor) || candidate.effect.primaryDimension === limitingFactor ? 30 : 0,
    buildIntentionFit: candidate.effect.buildIntentions.includes(request.intention)
      ? 18
      : dimensionRank >= 0 ? Math.max(2, 12 - dimensionRank * 2) : 0,
    usefulImprovement,
    reliability: Math.max(-8, 14 - riskCost - warnings * 2),
    costFit: costFitScore(candidate, request),
    confidence: Math.round(confidenceWeight(candidate.effect.confidence) * 14),
    supportingSystemPenalty: -(requiredMissing * 8 + Math.max(0, constraints.supportingRequirements.length - requiredMissing) * 2),
    dataGapPenalty: -Math.min(12, constraints.missingData.length * 2),
  };
}

function usefulImprovementScore(
  candidate: CandidateEngineeringChange,
  vehicle: VehicleEngineeringProfile,
  limitingFactor: PerformanceDimension,
) {
  let score = candidate.effect.primaryDimension === limitingFactor ? 12 : 6;
  const stockPower = measurementValue(vehicle, "POWER");
  const stockTorque = measurementValue(vehicle, "TORQUE");
  const hpRatio = stockPower && candidate.estimatedHpGain !== null ? candidate.estimatedHpGain / stockPower : null;
  const torqueRatio = stockTorque && candidate.estimatedTorqueGain !== null ? candidate.estimatedTorqueGain / stockTorque : null;
  const documentedRatio = Math.max(hpRatio ?? 0, torqueRatio ?? 0);
  if (documentedRatio > 0) score += Math.min(12, Math.round(documentedRatio * 100));
  return score;
}

function costFitScore(candidate: CandidateEngineeringChange, request: EngineeringBuildRequest) {
  const budget = request.constraints.find((constraint) => constraint.enabled && constraint.type === "BUDGET" && constraint.unit === "cents");
  if (candidate.priceCents === null || budget?.numericLimit === null || budget?.numericLimit === undefined) return 4;
  if (budget.numericLimit <= 0) return 0;
  const share = candidate.priceCents / budget.numericLimit;
  return Math.max(0, Math.round(10 * (1 - share)));
}

function buildRecommendation(input: {
  candidate: CandidateEngineeringChange;
  constraints: EngineeringConstraintAnalysis;
  vehicle: VehicleEngineeringProfile;
  limitingFactor: PerformanceDimension;
}): EngineeringRecommendation {
  const { candidate, constraints, vehicle, limitingFactor } = input;
  const expectedBenefits = candidate.effect.benefits.map((benefit) => ({
    dimension: benefit.dimension,
    summary: benefit.summary,
    measurement: benefitMeasurement(candidate, benefit.dimension),
  }));
  const relevantEvidence = vehicle.measurements
    .filter((measurement) => measurement.dimension === limitingFactor || candidate.effect.benefits.some((benefit) => benefit.dimension === measurement.dimension))
    .flatMap((measurement) => measurement.evidenceIds);
  const confidence = recommendationConfidence(candidate, expectedBenefits);

  return {
    limitingFactor,
    recommendedPartTypeId: candidate.componentTypeId,
    expectedBenefits,
    tradeoffs: candidate.effect.tradeoffs.map((tradeoff) => tradeoff.summary),
    supportingRequirements: constraints.supportingRequirements,
    hardIncompatibilities: constraints.hardIncompatibilities,
    confidence,
    evidenceIds: [...new Set(relevantEvidence)],
    missingData: constraints.missingData,
    explanation: explainRecommendation(candidate, limitingFactor, constraints),
  };
}

function benefitMeasurement(candidate: CandidateEngineeringChange, dimension: PerformanceDimension): EngineeringMeasurement | null {
  const value = dimension === "POWER" ? candidate.estimatedHpGain : dimension === "TORQUE" ? candidate.estimatedTorqueGain : null;
  if (value === null || value <= 0) return null;
  const evidenceIds = dimension === "POWER"
    ? candidate.estimatedHpGainEvidenceIds ?? []
    : candidate.estimatedTorqueGainEvidenceIds ?? [];
  return {
    dimension,
    value,
    minimum: null,
    maximum: null,
    unit: dimension === "POWER" ? "hp" : "lb-ft",
    confidence: candidate.estimatedGainConfidence ?? candidate.effect.confidence,
    evidenceIds,
    derivedFrom: candidate.componentTypeId ? [candidate.componentTypeId] : [],
  };
}

function recommendationConfidence(
  candidate: CandidateEngineeringChange,
  expectedBenefits: EngineeringRecommendation["expectedBenefits"],
): EngineeringConfidence {
  const hasNumericalClaim = expectedBenefits.some((benefit) => benefit.measurement !== null);
  if (!hasNumericalClaim) return candidate.effect.confidence;
  return weakestConfidence(candidate.effect.confidence, ...expectedBenefits.flatMap((benefit) => benefit.measurement?.confidence ?? []));
}

function explainRecommendation(
  candidate: CandidateEngineeringChange,
  limitingFactor: PerformanceDimension,
  constraints: EngineeringConstraintAnalysis,
) {
  const label = dimensionLabel(limitingFactor);
  const addressesLimit = candidate.effect.primaryDimension === limitingFactor
    || candidate.effect.benefits.some((benefit) => benefit.dimension === limitingFactor);
  const opening = addressesLimit
    ? `${candidate.componentName} addresses the build's current ${label} constraint.`
    : `${candidate.componentName} supports the requested build direction while ${label} remains the primary constraint.`;
  if (constraints.supportingRequirements.length === 0) return opening;
  return `${opening} Verify ${joinReadable(constraints.supportingRequirements)} as part of the upgrade path.`;
}

function measurementValue(vehicle: VehicleEngineeringProfile, dimension: PerformanceDimension) {
  return vehicle.measurements.find((measurement) => measurement.dimension === dimension)?.value ?? null;
}

function weakestConfidence(...values: EngineeringConfidence[]): EngineeringConfidence {
  return values.sort((left, right) => confidenceWeight(left) - confidenceWeight(right))[0] ?? "UNKNOWN";
}

function dimensionLabel(dimension: PerformanceDimension) {
  return dimension.toLowerCase().replaceAll("_", " ");
}

function joinReadable(values: string[]) {
  if (values.length <= 1) return values[0] ?? "the supporting systems";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}
