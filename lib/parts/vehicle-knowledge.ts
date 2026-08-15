import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  ENGINEERING_CONTRACT_VERSION,
  auditVehicleEngineeringProfile,
  type EngineeringConfidence,
  type EngineeringEvidence,
  type EngineeringMeasurement,
  type EngineeringSourceType,
  type VehicleEngineeringProfile,
} from "./engineering-contract";

export async function getVehicleEngineeringProfile(input: { modelId: string; variantId?: string | null }) {
  const profileKey = input.variantId ? `${input.modelId}:variant:${input.variantId}` : `${input.modelId}:base`;
  const profile = await prisma.modelEngineeringProfile.findUnique({
    where: { profileKey },
    include: {
      model: { select: { makeId: true } },
      evidence: { orderBy: [{ fieldName: "asc" }, { confidence: "asc" }] },
    },
  });
  if (!profile) return null;

  const engineeringProfile = toEngineeringContractProfile(profile);
  return { profile: engineeringProfile, audit: auditVehicleEngineeringProfile(engineeringProfile) };
}

type StoredProfile = Prisma.ModelEngineeringProfileGetPayload<{
  include: { model: { select: { makeId: true } }; evidence: true };
}>;

export function toEngineeringContractProfile(profile: StoredProfile): VehicleEngineeringProfile {
  const evidence = profile.evidence.map((item): EngineeringEvidence => ({
    id: item.id,
    sourceType: safeSourceType(item.sourceType),
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    capturedAt: item.capturedAt,
    confidence: safeConfidence(item.confidence),
    notes: item.notes,
  }));
  const measurements = [
    measurement(profile, "horsepower", "POWER", profile.horsepower, "hp"),
    measurement(profile, "torqueLbFt", "TORQUE", profile.torqueLbFt, "lb-ft"),
    measurement(profile, "weightLb", "MASS", profile.weightLb, "lb"),
  ].filter((item): item is EngineeringMeasurement => Boolean(item));

  return {
    contractVersion: ENGINEERING_CONTRACT_VERSION,
    makeId: profile.model.makeId,
    modelId: profile.modelId,
    variantId: profile.variantId,
    year: profile.yearEnd ?? profile.yearStart,
    engineCode: profile.engineCode,
    aspiration: safeAspiration(profile.aspiration),
    drivetrain: safeDrivetrain(profile.drivetrain),
    transmission: safeTransmission(profile.transmissionType),
    measurements,
    tires: hasAny([profile.frontTireWidthMm, profile.rearTireWidthMm, profile.frontWheelDiameterIn, profile.rearWheelDiameterIn, profile.tireCompound, profile.tireLoadRating]) ? {
      frontWidthMm: profile.frontTireWidthMm,
      rearWidthMm: profile.rearTireWidthMm,
      frontDiameterInches: profile.frontWheelDiameterIn,
      rearDiameterInches: profile.rearWheelDiameterIn,
      compound: profile.tireCompound,
      loadRating: profile.tireLoadRating,
    } : null,
    brakes: hasAny([profile.frontRotorDiameterMm, profile.rearRotorDiameterMm, profile.frontBrakePistonCount, profile.rearBrakePistonCount, profile.brakeRotorMaterial]) ? {
      frontRotorDiameterMm: profile.frontRotorDiameterMm,
      rearRotorDiameterMm: profile.rearRotorDiameterMm,
      frontPistonCount: profile.frontBrakePistonCount,
      rearPistonCount: profile.rearBrakePistonCount,
      rotorMaterial: profile.brakeRotorMaterial,
    } : null,
    thermal: hasAny([profile.oilCooling, profile.chargeCooling, profile.transmissionCooling, profile.brakeCooling]) || profile.sustainedUseRating !== "UNKNOWN" ? {
      oilCooling: profile.oilCooling,
      chargeCooling: profile.chargeCooling,
      transmissionCooling: profile.transmissionCooling,
      brakeCooling: profile.brakeCooling,
      sustainedUseRating: ["STREET", "FAST_ROAD", "TRACK"].includes(profile.sustainedUseRating)
        ? profile.sustainedUseRating as "STREET" | "FAST_ROAD" | "TRACK"
        : "UNKNOWN",
    } : null,
    evidence,
  };
}

function measurement(
  profile: StoredProfile,
  fieldName: string,
  dimension: EngineeringMeasurement["dimension"],
  value: number | null,
  unit: EngineeringMeasurement["unit"],
): EngineeringMeasurement | null {
  if (value === null) return null;
  const fieldEvidence = profile.evidence.filter((item) => item.fieldName === fieldName);
  return {
    dimension,
    value,
    minimum: null,
    maximum: null,
    unit,
    confidence: strongestConfidence(fieldEvidence.map((item) => safeConfidence(item.confidence)), safeConfidence(profile.confidence)),
    evidenceIds: fieldEvidence.map((item) => item.id),
    derivedFrom: [],
  };
}

function strongestConfidence(values: EngineeringConfidence[], fallback: EngineeringConfidence) {
  const rank: Record<EngineeringConfidence, number> = { VERIFIED: 5, HIGH: 4, MEDIUM: 3, LOW: 2, UNKNOWN: 1 };
  return values.sort((a, b) => rank[b] - rank[a])[0] ?? fallback;
}

function safeConfidence(value: string): EngineeringConfidence {
  return ["VERIFIED", "HIGH", "MEDIUM", "LOW"].includes(value) ? value as EngineeringConfidence : "UNKNOWN";
}

function safeSourceType(value: string): EngineeringSourceType {
  return ["OEM_SPECIFICATION", "REGULATORY_VIN_DECODE", "INSTRUMENTED_TEST", "DYNO_TEST", "PART_MANUFACTURER", "OWNER_RECORDED", "TRUSTED_REFERENCE", "DERIVED_CALCULATION"].includes(value)
    ? value as EngineeringSourceType
    : "TRUSTED_REFERENCE";
}

function safeAspiration(value: string): VehicleEngineeringProfile["aspiration"] {
  return ["NATURALLY_ASPIRATED", "FORCED_INDUCTION", "ELECTRIC", "HYBRID"].includes(value)
    ? value as VehicleEngineeringProfile["aspiration"]
    : "UNKNOWN";
}

function safeDrivetrain(value: string): VehicleEngineeringProfile["drivetrain"] {
  return ["FWD", "RWD", "AWD", "4WD"].includes(value) ? value as VehicleEngineeringProfile["drivetrain"] : "UNKNOWN";
}

function safeTransmission(value: string): VehicleEngineeringProfile["transmission"] {
  return ["MANUAL", "AUTOMATIC", "DCT", "CVT", "SEQUENTIAL", "SINGLE_SPEED"].includes(value)
    ? value as VehicleEngineeringProfile["transmission"]
    : "UNKNOWN";
}

function hasAny(values: unknown[]) {
  return values.some((value) => value !== null && value !== undefined && value !== "");
}
