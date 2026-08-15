import {
  classifyEngineeringAspiration,
  classifyEngineeringDrivetrain,
  classifyEngineeringTransmission,
  normalizeHorsepower,
} from "./engineering-normalization";
import type { Aspiration, DrivetrainLayout, EngineeringConfidence, TransmissionType } from "./engineering-contract";

export type VinEngineeringRecord = {
  year?: number | null;
  engine: string | null;
  engineHP: string | null;
  transmission: string | null;
  drivetrain: string | null;
  turbo: string | null;
  fuelType: string | null;
};

export type VinEngineeringConsensusField<T> = {
  value: T;
  rawValue: string;
  confidence: EngineeringConfidence;
  supportingRecords: number;
};

export type VinEngineeringConsensus = {
  engineCode: VinEngineeringConsensusField<string> | null;
  horsepower: VinEngineeringConsensusField<number> | null;
  transmissionType: VinEngineeringConsensusField<TransmissionType> | null;
  transmissionDescription: VinEngineeringConsensusField<string> | null;
  drivetrain: VinEngineeringConsensusField<DrivetrainLayout> | null;
  aspiration: VinEngineeringConsensusField<Aspiration> | null;
};

export function resolveVinEngineeringConsensus(
  records: VinEngineeringRecord[],
  productionYears?: { start: number | null; end: number | null },
): VinEngineeringConsensus {
  const eligibleRecords = records.filter((record) => isWithinProductionYears(record.year, productionYears));
  const engine = consensus(eligibleRecords.map((record) => record.engine));
  const horsepower = consensus(eligibleRecords.map((record) => record.engineHP));
  const transmission = classifiedConsensus(eligibleRecords.map((record) => record.transmission), classifyEngineeringTransmission, "UNKNOWN");
  const drivetrain = classifiedConsensus(eligibleRecords.map((record) => record.drivetrain), classifyEngineeringDrivetrain, "UNKNOWN");
  const turbo = consensus(eligibleRecords.map((record) => record.turbo));
  const fuelType = consensus(eligibleRecords.map((record) => record.fuelType));
  const engineCode = engine ? normalizeEngineCode(engine.value) : null;
  const horsepowerValue = horsepower ? normalizeHorsepower(horsepower.value) : null;
  const aspiration = classifyAspiration({ engine, turbo, fuelType });

  return {
    engineCode: engine && engineCode ? field(engineCode, engine) : null,
    horsepower: horsepower && horsepowerValue ? field(horsepowerValue, horsepower) : null,
    transmissionType: transmission ? field(transmission.classified, transmission) : null,
    transmissionDescription: transmission ? field(transmission.value, transmission) : null,
    drivetrain: drivetrain ? field(drivetrain.classified, drivetrain) : null,
    aspiration: aspiration.value !== "UNKNOWN" && aspiration.source ? field(aspiration.value, aspiration.source) : null,
  };
}

function isWithinProductionYears(year: number | null | undefined, productionYears?: { start: number | null; end: number | null }) {
  if (!productionYears || (!productionYears.start && !productionYears.end)) return true;
  if (!year) return false;
  if (productionYears.start && year < productionYears.start) return false;
  if (productionYears.end && year > productionYears.end) return false;
  return true;
}

type ConsensusValue = { value: string; count: number };

function classifyAspiration(input: { engine: ConsensusValue | null; turbo: ConsensusValue | null; fuelType: ConsensusValue | null }) {
  const fuel = input.fuelType?.value || "";
  if (/battery electric|electric vehicle|\bev\b/i.test(fuel) && !/hybrid/i.test(fuel)) {
    return { value: "ELECTRIC" as const, source: input.fuelType };
  }
  if (/hybrid|phev/i.test(fuel)) return { value: "HYBRID" as const, source: input.fuelType };
  if (/yes|true|turbo|supercharg/i.test(input.turbo?.value || "")) {
    return { value: "FORCED_INDUCTION" as const, source: input.turbo };
  }
  const fromEngine = classifyEngineeringAspiration(input.engine?.value);
  return { value: fromEngine, source: input.engine && fromEngine !== "UNKNOWN" ? input.engine : null };
}

function normalizeEngineCode(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!/^(?=.{2,30}$)(?=.*[a-z])(?=.*\d)[a-z0-9./_-]+(?: [a-z0-9./_-]+){0,2}$/i.test(normalized)) return null;
  if (/\b(?:engine|motor|standard|unknown|not applicable|n\/a)\b/i.test(normalized)) return null;
  if (/\b\d(?:\.\d+)?l\b|\bv\d{1,2}\b|\bi\d{1,2}\b/i.test(normalized)) return null;
  return normalized;
}

function consensus(values: Array<string | null>) {
  const buckets = new Map<string, { value: string; count: number }>();
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLowerCase().replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
    const prior = buckets.get(key);
    buckets.set(key, { value: prior?.value ?? value, count: (prior?.count ?? 0) + 1 });
  }
  const ranked = [...buckets.values()].sort((left, right) => right.count - left.count || right.value.length - left.value.length);
  if (!ranked[0] || (ranked[1] && ranked[0].count === ranked[1].count)) return null;
  return ranked[0];
}

function classifiedConsensus<T extends string>(values: Array<string | null>, classify: (value?: string | null) => T, unknown: T) {
  const buckets = new Map<T, { classified: T; value: string; count: number }>();
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const classified = classify(value);
    if (classified === unknown) continue;
    const prior = buckets.get(classified);
    buckets.set(classified, { classified, value: prior?.value ?? value, count: (prior?.count ?? 0) + 1 });
  }
  const ranked = [...buckets.values()].sort((left, right) => right.count - left.count || right.value.length - left.value.length);
  if (!ranked[0] || (ranked[1] && ranked[0].count === ranked[1].count)) return null;
  return ranked[0];
}

function field<T>(value: T, source: { value: string; count: number }): VinEngineeringConsensusField<T> {
  return {
    value,
    rawValue: source.value,
    confidence: source.count >= 2 ? "MEDIUM" : "LOW",
    supportingRecords: source.count,
  };
}
