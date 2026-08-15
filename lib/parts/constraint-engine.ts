import {
  auditVehicleEngineeringProfile,
  confidenceWeight,
  type EngineeringBuildRequest,
  type EngineeringConfidence,
  type EngineeringConstraintFinding,
  type EngineeringEvidence,
  type EngineeringRequiredModelField,
  type PerformanceDimension,
  type VehicleEngineeringProfile,
} from "./engineering-contract";
import type { VehicleBuildProfile } from "./build-profile";
import type { PartEngineeringEffectDefinition } from "./part-effects";
import { toBuildCategorySlug, toStoragePartSystemSlug } from "./category-system";

export const ENGINEERING_LOAD_LEVELS = ["LOW", "MODERATE", "HIGH", "UNKNOWN"] as const;
export type EngineeringLoadLevel = (typeof ENGINEERING_LOAD_LEVELS)[number];

export type CandidateEngineeringChange = {
  componentTypeId: string | null;
  componentName: string;
  systemSlug: string;
  estimatedHpGain: number | null;
  estimatedTorqueGain: number | null;
  estimatedGainConfidence?: EngineeringConfidence;
  estimatedHpGainEvidenceIds?: string[];
  estimatedTorqueGainEvidenceIds?: string[];
  performanceEvidence?: EngineeringEvidence[];
  priceCents: number | null;
  effect: PartEngineeringEffectDefinition;
};

export type ConstraintLoadAssessment = {
  dimension: PerformanceDimension;
  level: EngineeringLoadLevel;
  ratio: number | null;
  explanation: string;
  confidence: EngineeringConfidence;
};

export type EngineeringConstraintAnalysis = {
  loads: {
    transmissionStress: ConstraintLoadAssessment;
    tractionDemand: ConstraintLoadAssessment;
    thermalLoad: ConstraintLoadAssessment;
    brakingDemand: ConstraintLoadAssessment;
  };
  findings: EngineeringConstraintFinding[];
  supportingRequirements: string[];
  hardIncompatibilities: string[];
  missingData: EngineeringRequiredModelField[];
  canRecommend: boolean;
};

export function analyzeEngineeringConstraints(input: {
  vehicle: VehicleEngineeringProfile;
  build: VehicleBuildProfile;
  request: EngineeringBuildRequest;
  candidate?: CandidateEngineeringChange | null;
}): EngineeringConstraintAnalysis {
  const { vehicle, build, request, candidate = null } = input;
  const audit = auditVehicleEngineeringProfile(vehicle);
  const findings: EngineeringConstraintFinding[] = [];
  const supportingRequirements = new Set(build.supportNeeds);
  const hardIncompatibilities = new Set<string>();
  const hpRatio = projectedRatio(build.stockHorsepower, build.recordedHpGain, candidate?.estimatedHpGain);
  const torqueRatio = projectedRatio(build.stockTorque, build.recordedTorqueGain, candidate?.estimatedTorqueGain);
  const outputRatio = maxKnown(hpRatio, torqueRatio);

  if (candidate) {
    applyCandidateDependencies(candidate, build, findings, supportingRequirements);
    applyCandidateCompatibility(candidate, vehicle, findings, hardIncompatibilities);
    applyRequestConstraints(candidate, request, findings, hardIncompatibilities);
  }

  applyBuildRisks({ vehicle, build, request, outputRatio, findings, supportingRequirements });

  const loads = {
    transmissionStress: assessTransmissionStress(vehicle, torqueRatio),
    tractionDemand: assessTractionDemand(vehicle, outputRatio),
    thermalLoad: assessThermalLoad(vehicle, build, request, outputRatio),
    brakingDemand: assessBrakingDemand(vehicle, build, request, outputRatio),
  };

  for (const load of Object.values(loads)) {
    if (load.level !== "HIGH") continue;
    findings.push(finding({
      code: `HIGH_${load.dimension}_DEMAND`,
      severity: "WARNING",
      dimension: load.dimension,
      title: highLoadTitle(load.dimension),
      explanation: load.explanation,
      supportingRequirements: supportForDimension(load.dimension),
      confidence: load.confidence,
      evidenceIds: evidenceForDimension(vehicle, load.dimension),
    }));
    supportForDimension(load.dimension).forEach((requirement) => supportingRequirements.add(requirement));
  }

  return {
    loads,
    findings: deduplicateFindings(findings),
    supportingRequirements: [...supportingRequirements].sort(),
    hardIncompatibilities: [...hardIncompatibilities].sort(),
    missingData: audit.missing,
    canRecommend: hardIncompatibilities.size === 0,
  };
}

function assessTransmissionStress(vehicle: VehicleEngineeringProfile, torqueRatio: number | null): ConstraintLoadAssessment {
  if (vehicle.transmission === "UNKNOWN" || torqueRatio === null) {
    return unknownLoad("DRIVETRAIN_CAPACITY", "Transmission type or torque data is missing, so drivetrain stress cannot be quantified.");
  }
  const adjustment = vehicle.transmission === "CVT" ? 0.05 : vehicle.transmission === "AUTOMATIC" ? 0.02 : 0;
  return ratioLoad(
    "DRIVETRAIN_CAPACITY",
    torqueRatio + adjustment,
    0.1,
    0.2,
    "Projected torque increase remains modest relative to the documented stock output.",
    "Projected torque increase raises drivetrain load and warrants capacity verification.",
    "Projected torque increase is substantial; verify transmission, clutch, differential, and axle capacity before installation.",
    measurementConfidence(vehicle, "TORQUE"),
  );
}

function assessTractionDemand(vehicle: VehicleEngineeringProfile, outputRatio: number | null): ConstraintLoadAssessment {
  if (vehicle.drivetrain === "UNKNOWN" || outputRatio === null) {
    return unknownLoad("TRACTION", "Drivetrain layout or output data is missing, so traction demand cannot be quantified.");
  }
  const layoutAdjustment = vehicle.drivetrain === "FWD" ? 0.06 : vehicle.drivetrain === "RWD" ? 0.03 : 0;
  return ratioLoad(
    "TRACTION",
    outputRatio + layoutAdjustment,
    0.12,
    0.25,
    "The projected output remains close to the factory traction demand.",
    "The projected output increases tire and differential demand.",
    "The projected output materially increases traction demand; tire condition, fitment, and differential behavior require verification.",
    weakestConfidence(measurementConfidence(vehicle, "POWER"), measurementConfidence(vehicle, "TORQUE")),
  );
}

function assessThermalLoad(
  vehicle: VehicleEngineeringProfile,
  build: VehicleBuildProfile,
  request: EngineeringBuildRequest,
  outputRatio: number | null,
): ConstraintLoadAssessment {
  if (outputRatio === null) return unknownLoad("THERMAL_CAPACITY", "Output data is missing, so added thermal load cannot be quantified.");
  let ratio = outputRatio;
  if (build.aspiration === "FORCED_INDUCTION" || build.installedCategories.has("forced-induction")) ratio += 0.08;
  if (request.intention === "TRACK_DAY" || request.plannedUseFrequency === "DAILY") ratio += 0.06;
  const confidence = vehicle.thermal ? measurementConfidence(vehicle, "POWER") : "LOW";
  return ratioLoad(
    "THERMAL_CAPACITY",
    ratio,
    0.1,
    0.22,
    "The projected heat load remains close to factory use.",
    "The projected use or output increases sustained cooling demand.",
    "The build and intended use create high thermal demand; cooling capacity and fluid condition require verification.",
    confidence,
  );
}

function assessBrakingDemand(
  vehicle: VehicleEngineeringProfile,
  build: VehicleBuildProfile,
  request: EngineeringBuildRequest,
  outputRatio: number | null,
): ConstraintLoadAssessment {
  if (outputRatio === null) return unknownLoad("BRAKING", "Output data is missing, so added braking demand cannot be quantified.");
  let ratio = outputRatio;
  if (request.intention === "TRACK_DAY" || request.intention === "AUTOCROSS") ratio += 0.1;
  if (build.stage === "HIGH_OUTPUT") ratio += 0.05;
  const confidence = vehicle.brakes ? measurementConfidence(vehicle, "POWER") : "LOW";
  return ratioLoad(
    "BRAKING",
    ratio,
    0.12,
    0.25,
    "The projected use remains close to factory braking demand.",
    "The projected performance raises repeated braking demand.",
    "The intended use or output creates high braking demand; inspect friction material, fluid, tires, and heat capacity first.",
    confidence,
  );
}

function applyCandidateDependencies(
  candidate: CandidateEngineeringChange,
  build: VehicleBuildProfile,
  findings: EngineeringConstraintFinding[],
  supportingRequirements: Set<string>,
) {
  for (const dependency of candidate.effect.dependencies) {
    if (hasInstalledSystem(build, dependency.systemSlug)) continue;
    supportingRequirements.add(dependency.systemSlug);
    findings.push(finding({
      code: `MISSING_${dependency.level}_${dependency.systemSlug}`.toUpperCase().replaceAll("-", "_"),
      severity: dependency.level === "REQUIRED" ? "WARNING" : "ADVISORY",
      dimension: candidate.effect.primaryDimension,
      title: `${titleFromSlug(dependency.systemSlug)} support ${dependency.level === "REQUIRED" ? "must be verified" : "is recommended"}`,
      explanation: `${dependency.reason} ${dependency.condition}`,
      supportingRequirements: [dependency.systemSlug],
      confidence: candidate.effect.confidence,
      evidenceIds: [],
    }));
  }
}

function applyCandidateCompatibility(
  candidate: CandidateEngineeringChange,
  vehicle: VehicleEngineeringProfile,
  findings: EngineeringConstraintFinding[],
  hardIncompatibilities: Set<string>,
) {
  const storageSystem = toStoragePartSystemSlug(candidate.systemSlug);
  const normalizedComponentName = candidate.componentName.toLowerCase();
  if (vehicle.aspiration === "ELECTRIC" && ["air-induction", "exhaust-emissions", "fuel-system"].includes(storageSystem)) {
    const reason = `${candidate.componentName} is an internal-combustion component and is incompatible with an electric powertrain.`;
    hardIncompatibilities.add(reason);
    findings.push(finding({
      code: "POWERTRAIN_TYPE_INCOMPATIBLE",
      severity: "HARD_BLOCKER",
      dimension: candidate.effect.primaryDimension,
      title: "Powertrain incompatibility",
      explanation: reason,
      supportingRequirements: [],
      confidence: "HIGH",
      evidenceIds: [],
    }));
  }

  if (isManualOnlyComponent(normalizedComponentName) && vehicle.transmission !== "MANUAL") {
    const reason = vehicle.transmission === "UNKNOWN"
      ? `${candidate.componentName} requires a verified manual transmission before it can be recommended.`
      : `${candidate.componentName} is manual-transmission hardware and is incompatible with the documented ${transmissionLabel(vehicle.transmission)}.`;
    hardIncompatibilities.add(reason);
    findings.push(finding({
      code: vehicle.transmission === "UNKNOWN" ? "MANUAL_TRANSMISSION_NOT_VERIFIED" : "TRANSMISSION_TYPE_INCOMPATIBLE",
      severity: "HARD_BLOCKER",
      dimension: "DRIVETRAIN_CAPACITY",
      title: vehicle.transmission === "UNKNOWN" ? "Manual transmission not verified" : "Transmission incompatibility",
      explanation: reason,
      supportingRequirements: vehicle.transmission === "UNKNOWN" ? ["verified transmission specification"] : [],
      confidence: vehicle.transmission === "UNKNOWN" ? "LOW" : "HIGH",
      evidenceIds: [],
    }));
  }
}

function isManualOnlyComponent(name: string) {
  return /\b(short shifter|manual shifter|clutch kit|clutch disc|pressure plate|flywheel|clutch master cylinder|clutch slave cylinder)\b/.test(name);
}

function transmissionLabel(transmission: VehicleEngineeringProfile["transmission"]) {
  return transmission.toLowerCase().replaceAll("_", " ");
}

function applyRequestConstraints(
  candidate: CandidateEngineeringChange,
  request: EngineeringBuildRequest,
  findings: EngineeringConstraintFinding[],
  hardIncompatibilities: Set<string>,
) {
  const budget = request.constraints.find((item) => item.enabled && item.type === "BUDGET");
  if (budget?.numericLimit !== null && budget?.numericLimit !== undefined && candidate.priceCents !== null) {
    const budgetCents = budget.unit === "cents" ? budget.numericLimit : null;
    if (budgetCents !== null && candidate.priceCents > budgetCents) {
      const reason = `${candidate.componentName} exceeds the stated parts budget.`;
      hardIncompatibilities.add(reason);
      findings.push(finding({
        code: "BUDGET_EXCEEDED",
        severity: "HARD_BLOCKER",
        dimension: candidate.effect.primaryDimension,
        title: "Parts budget exceeded",
        explanation: reason,
        supportingRequirements: [],
        confidence: "VERIFIED",
        evidenceIds: [],
      }));
    }
  }

  const storageSystem = toStoragePartSystemSlug(candidate.systemSlug);
  if (constraintEnabled(request, "EMISSIONS_COMPLIANCE") && ["exhaust-emissions", "ecu-electronics", "air-induction"].includes(storageSystem)) {
    findings.push(finding({
      code: "EMISSIONS_DOCUMENTATION_REQUIRED",
      severity: "WARNING",
      dimension: "RELIABILITY",
      title: "Emissions compliance must be verified",
      explanation: "The requested build preserves emissions compliance, but this component can affect emissions equipment or calibration.",
      supportingRequirements: ["documented emissions-compliant configuration"],
      confidence: "MEDIUM",
      evidenceIds: [],
    }));
  }
}

function applyBuildRisks(input: {
  vehicle: VehicleEngineeringProfile;
  build: VehicleBuildProfile;
  request: EngineeringBuildRequest;
  outputRatio: number | null;
  findings: EngineeringConstraintFinding[];
  supportingRequirements: Set<string>;
}) {
  const { vehicle, build, request, outputRatio, findings, supportingRequirements } = input;
  const highMileage = constraintEnabled(request, "HIGH_MILEAGE") || (request.currentMileage !== null && request.currentMileage >= 100_000);
  if (highMileage && (outputRatio ?? 0) > 0.05) {
    supportingRequirements.add("pre-upgrade mechanical inspection");
    findings.push(finding({
      code: "HIGH_MILEAGE_OUTPUT_INCREASE",
      severity: "WARNING",
      dimension: "RELIABILITY",
      title: "Verify mechanical condition first",
      explanation: "The vehicle is high-mileage and the recorded or proposed build increases output. Compression, leak-down, fluids, mounts, and cooling condition should be checked first.",
      supportingRequirements: ["pre-upgrade mechanical inspection"],
      confidence: "MEDIUM",
      evidenceIds: [],
    }));
  }
  if (build.stage === "HIGH_OUTPUT" && vehicle.transmission === "UNKNOWN") {
    findings.push(finding({
      code: "UNKNOWN_TRANSMISSION_HIGH_OUTPUT",
      severity: "WARNING",
      dimension: "DRIVETRAIN_CAPACITY",
      title: "Transmission capacity is unknown",
      explanation: "A high-output build is recorded, but the transmission type and capacity are not verified.",
      supportingRequirements: ["verified transmission specification"],
      confidence: "LOW",
      evidenceIds: [],
    }));
  }
}

function ratioLoad(
  dimension: PerformanceDimension,
  ratio: number,
  moderateAt: number,
  highAt: number,
  lowText: string,
  moderateText: string,
  highText: string,
  confidence: EngineeringConfidence,
): ConstraintLoadAssessment {
  const level = ratio >= highAt ? "HIGH" : ratio >= moderateAt ? "MODERATE" : "LOW";
  return { dimension, level, ratio, explanation: level === "HIGH" ? highText : level === "MODERATE" ? moderateText : lowText, confidence };
}

function unknownLoad(dimension: PerformanceDimension, explanation: string): ConstraintLoadAssessment {
  return { dimension, level: "UNKNOWN", ratio: null, explanation, confidence: "UNKNOWN" };
}

function projectedRatio(stock: number | null, recordedGain: number, candidateGain?: number | null) {
  if (!stock || stock <= 0) return null;
  return Math.max(0, recordedGain + (candidateGain ?? 0)) / stock;
}

function maxKnown(...values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? Math.max(...known) : null;
}

function measurementConfidence(vehicle: VehicleEngineeringProfile, dimension: PerformanceDimension): EngineeringConfidence {
  return vehicle.measurements.find((item) => item.dimension === dimension)?.confidence ?? "UNKNOWN";
}

function weakestConfidence(...values: EngineeringConfidence[]) {
  return values.sort((left, right) => confidenceWeight(left) - confidenceWeight(right))[0] ?? "UNKNOWN";
}

function constraintEnabled(request: EngineeringBuildRequest, type: EngineeringBuildRequest["constraints"][number]["type"]) {
  return request.constraints.some((item) => item.type === type && item.enabled);
}

function evidenceForDimension(vehicle: VehicleEngineeringProfile, dimension: PerformanceDimension) {
  return vehicle.measurements.find((item) => item.dimension === dimension)?.evidenceIds ?? [];
}

function supportForDimension(dimension: PerformanceDimension) {
  const requirements: Partial<Record<PerformanceDimension, string[]>> = {
    DRIVETRAIN_CAPACITY: ["verified drivetrain capacity"],
    TRACTION: ["wheels-tires"],
    THERMAL_CAPACITY: ["cooling"],
    BRAKING: ["brakes"],
  };
  return requirements[dimension] ?? [];
}

function highLoadTitle(dimension: PerformanceDimension) {
  const titles: Partial<Record<PerformanceDimension, string>> = {
    DRIVETRAIN_CAPACITY: "High drivetrain demand",
    TRACTION: "High traction demand",
    THERMAL_CAPACITY: "High thermal demand",
    BRAKING: "High braking demand",
  };
  return titles[dimension] ?? "High system demand";
}

function finding(value: EngineeringConstraintFinding) {
  return value;
}

function deduplicateFindings(findings: EngineeringConstraintFinding[]) {
  return [...new Map(findings.map((item) => [item.code, item])).values()];
}

function titleFromSlug(value: string) {
  return value.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function hasInstalledSystem(build: VehicleBuildProfile, systemSlug: string) {
  return build.installedCategories.has(systemSlug)
    || build.installedCategories.has(toBuildCategorySlug(systemSlug));
}
