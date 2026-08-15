import { z } from "zod";

export const ENGINEERING_CONTRACT_VERSION = "1.0.0" as const;

export const ENGINEERING_CONFIDENCE_LEVELS = ["VERIFIED", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
export type EngineeringConfidence = (typeof ENGINEERING_CONFIDENCE_LEVELS)[number];

export const BUILD_INTENTIONS = [
  "STREET_BALANCED",
  "DAILY_DRIVER",
  "TRACK_DAY",
  "AUTOCROSS",
  "DRAG",
  "TOURING",
  "SHOW",
] as const;
export type BuildIntention = (typeof BUILD_INTENTIONS)[number];

export const BUILD_STAGES = ["STOCK", "BOLT_ON", "TUNED", "HIGH_OUTPUT"] as const;
export type BuildStage = (typeof BUILD_STAGES)[number];

export const ASPIRATION_TYPES = ["NATURALLY_ASPIRATED", "FORCED_INDUCTION", "ELECTRIC", "HYBRID", "UNKNOWN"] as const;
export type Aspiration = (typeof ASPIRATION_TYPES)[number];

export const DRIVETRAIN_LAYOUTS = ["FWD", "RWD", "AWD", "4WD", "UNKNOWN"] as const;
export type DrivetrainLayout = (typeof DRIVETRAIN_LAYOUTS)[number];

export const TRANSMISSION_TYPES = ["MANUAL", "AUTOMATIC", "DCT", "CVT", "SEQUENTIAL", "SINGLE_SPEED", "UNKNOWN"] as const;
export type TransmissionType = (typeof TRANSMISSION_TYPES)[number];

export const PERFORMANCE_DIMENSIONS = [
  "POWER",
  "TORQUE",
  "MASS",
  "POWER_TO_WEIGHT",
  "TRACTION",
  "BRAKING",
  "HANDLING",
  "THERMAL_CAPACITY",
  "DRIVETRAIN_CAPACITY",
  "AERODYNAMICS",
  "RELIABILITY",
] as const;
export type PerformanceDimension = (typeof PERFORMANCE_DIMENSIONS)[number];

export const ENGINEERING_UNITS = [
  "hp",
  "lb-ft",
  "lb",
  "lb/hp",
  "mph",
  "second",
  "mile",
  "inch",
  "psi",
  "fahrenheit",
  "percent",
  "ratio",
  "rpm",
  "mm",
  "cents",
] as const;
export type EngineeringUnit = (typeof ENGINEERING_UNITS)[number];

export const DIMENSION_UNITS: Record<PerformanceDimension, readonly EngineeringUnit[]> = {
  POWER: ["hp"],
  TORQUE: ["lb-ft"],
  MASS: ["lb"],
  POWER_TO_WEIGHT: ["lb/hp", "ratio"],
  TRACTION: ["percent", "ratio"],
  BRAKING: ["inch", "mm", "percent", "second"],
  HANDLING: ["percent", "ratio"],
  THERMAL_CAPACITY: ["fahrenheit", "percent", "ratio"],
  DRIVETRAIN_CAPACITY: ["lb-ft", "hp", "percent", "ratio"],
  AERODYNAMICS: ["percent", "ratio"],
  RELIABILITY: ["percent", "ratio", "mile"],
};

export const ENGINEERING_SOURCE_TYPES = [
  "OEM_SPECIFICATION",
  "REGULATORY_VIN_DECODE",
  "INSTRUMENTED_TEST",
  "DYNO_TEST",
  "PART_MANUFACTURER",
  "OWNER_RECORDED",
  "TRUSTED_REFERENCE",
  "DERIVED_CALCULATION",
] as const;
export type EngineeringSourceType = (typeof ENGINEERING_SOURCE_TYPES)[number];

export const engineeringEvidenceSchema = z.object({
  id: z.string().min(1),
  sourceType: z.enum(ENGINEERING_SOURCE_TYPES),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url().nullable().default(null),
  capturedAt: z.coerce.date(),
  confidence: z.enum(ENGINEERING_CONFIDENCE_LEVELS),
  notes: z.string().max(1_000).nullable().default(null),
});
export type EngineeringEvidence = z.infer<typeof engineeringEvidenceSchema>;

export const engineeringMeasurementSchema = z.object({
  dimension: z.enum(PERFORMANCE_DIMENSIONS),
  value: z.number().finite(),
  minimum: z.number().finite().nullable().default(null),
  maximum: z.number().finite().nullable().default(null),
  unit: z.enum(ENGINEERING_UNITS),
  confidence: z.enum(ENGINEERING_CONFIDENCE_LEVELS),
  evidenceIds: z.array(z.string().min(1)).default([]),
  derivedFrom: z.array(z.string().min(1)).default([]),
}).superRefine((measurement, context) => {
  if (!DIMENSION_UNITS[measurement.dimension].includes(measurement.unit)) {
    context.addIssue({
      code: "custom",
      message: `${measurement.unit} is not valid for ${measurement.dimension}.`,
      path: ["unit"],
    });
  }
  if (measurement.minimum !== null && measurement.maximum !== null && measurement.minimum > measurement.maximum) {
    context.addIssue({ code: "custom", message: "Minimum cannot exceed maximum.", path: ["minimum"] });
  }
  if (["VERIFIED", "HIGH"].includes(measurement.confidence) && measurement.evidenceIds.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Verified and high-confidence measurements require evidence.",
      path: ["evidenceIds"],
    });
  }
});
export type EngineeringMeasurement = z.infer<typeof engineeringMeasurementSchema>;

export type TireEngineeringProfile = {
  frontWidthMm: number | null;
  rearWidthMm: number | null;
  frontDiameterInches: number | null;
  rearDiameterInches: number | null;
  compound: string | null;
  loadRating: string | null;
};

export type BrakeEngineeringProfile = {
  frontRotorDiameterMm: number | null;
  rearRotorDiameterMm: number | null;
  frontPistonCount: number | null;
  rearPistonCount: number | null;
  rotorMaterial: string | null;
};

export type ThermalEngineeringProfile = {
  oilCooling: string | null;
  chargeCooling: string | null;
  transmissionCooling: string | null;
  brakeCooling: string | null;
  sustainedUseRating: "STREET" | "FAST_ROAD" | "TRACK" | "UNKNOWN";
};

export type VehicleEngineeringProfile = {
  contractVersion: typeof ENGINEERING_CONTRACT_VERSION;
  makeId: string;
  modelId: string;
  variantId: string | null;
  year: number | null;
  engineCode: string | null;
  aspiration: Aspiration;
  drivetrain: DrivetrainLayout;
  transmission: TransmissionType;
  measurements: EngineeringMeasurement[];
  tires: TireEngineeringProfile | null;
  brakes: BrakeEngineeringProfile | null;
  thermal: ThermalEngineeringProfile | null;
  evidence: EngineeringEvidence[];
};

export const BUILD_CONSTRAINT_TYPES = [
  "BUDGET",
  "STREET_LEGALITY",
  "EMISSIONS_COMPLIANCE",
  "WARRANTY_PRESERVATION",
  "RELIABILITY_PRIORITY",
  "NVH_TOLERANCE",
  "INSTALL_COMPLEXITY",
  "FUEL_AVAILABILITY",
  "CLIMATE",
  "HIGH_MILEAGE",
] as const;
export type BuildConstraintType = (typeof BUILD_CONSTRAINT_TYPES)[number];

export type BuildConstraint = {
  type: BuildConstraintType;
  enabled: boolean;
  numericLimit: number | null;
  unit: EngineeringUnit | null;
  value: string | null;
};

export type EngineeringBuildRequest = {
  intention: BuildIntention;
  constraints: BuildConstraint[];
  currentMileage: number | null;
  plannedUseFrequency: "OCCASIONAL" | "WEEKLY" | "DAILY";
};

export const ENGINEERING_REQUIRED_MODEL_FIELDS = [
  "engineCode",
  "aspiration",
  "horsepower",
  "torque",
  "weight",
  "drivetrain",
  "transmission",
  "tires",
  "brakes",
  "thermal",
] as const;
export type EngineeringRequiredModelField = (typeof ENGINEERING_REQUIRED_MODEL_FIELDS)[number];

export const CONSTRAINT_SEVERITIES = ["HARD_BLOCKER", "WARNING", "ADVISORY"] as const;
export type ConstraintSeverity = (typeof CONSTRAINT_SEVERITIES)[number];

export type EngineeringConstraintFinding = {
  code: string;
  severity: ConstraintSeverity;
  dimension: PerformanceDimension;
  title: string;
  explanation: string;
  supportingRequirements: string[];
  confidence: EngineeringConfidence;
  evidenceIds: string[];
};

export type EngineeringRecommendation = {
  limitingFactor: PerformanceDimension;
  recommendedPartTypeId: string | null;
  expectedBenefits: Array<{ dimension: PerformanceDimension; summary: string; measurement: EngineeringMeasurement | null }>;
  tradeoffs: string[];
  supportingRequirements: string[];
  hardIncompatibilities: string[];
  confidence: EngineeringConfidence;
  evidenceIds: string[];
  missingData: EngineeringRequiredModelField[];
  explanation: string;
};

export function auditVehicleEngineeringProfile(profile: VehicleEngineeringProfile) {
  const dimensions = new Set(profile.measurements.map((measurement) => measurement.dimension));
  const missing: EngineeringRequiredModelField[] = [];
  if (!profile.engineCode) missing.push("engineCode");
  if (profile.aspiration === "UNKNOWN") missing.push("aspiration");
  if (!dimensions.has("POWER")) missing.push("horsepower");
  if (!dimensions.has("TORQUE")) missing.push("torque");
  if (!dimensions.has("MASS")) missing.push("weight");
  if (profile.drivetrain === "UNKNOWN") missing.push("drivetrain");
  if (profile.transmission === "UNKNOWN") missing.push("transmission");
  if (!profile.tires) missing.push("tires");
  if (!profile.brakes) missing.push("brakes");
  if (!profile.thermal) missing.push("thermal");

  return {
    complete: missing.length === 0,
    missing,
    numericalRecommendationReady: !missing.some((field) => ["horsepower", "torque", "weight"].includes(field)),
    constraintAnalysisReady: !missing.some((field) => ["torque", "drivetrain", "transmission", "tires", "brakes", "thermal"].includes(field)),
  };
}

export function confidenceWeight(confidence: EngineeringConfidence) {
  return { VERIFIED: 1, HIGH: 0.85, MEDIUM: 0.65, LOW: 0.35, UNKNOWN: 0 }[confidence];
}
