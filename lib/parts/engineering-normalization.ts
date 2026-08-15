import type { Aspiration, DrivetrainLayout, TransmissionType } from "./engineering-contract";

export function normalizeHorsepower(value?: string | null) {
  const parsed = firstPositiveNumber(value);
  if (parsed === null) return null;
  if (/\bkw\b/i.test(value || "") && !/\bhp\b/i.test(value || "")) return Math.round(parsed * 1.34102);
  return Math.round(parsed);
}

export function normalizeTorqueLbFt(value?: string | null) {
  const parsed = firstPositiveNumber(value);
  if (parsed === null) return null;
  if (/\bn\s*[·.-]?\s*m\b|newton/i.test(value || "") && !/lb|ft/i.test(value || "")) {
    return Math.round(parsed * 0.737562);
  }
  return Math.round(parsed);
}

export function normalizeWeightLb(value?: string | null) {
  const parsed = firstPositiveNumber(value);
  if (parsed === null) return null;
  if (/\bkg\b|kilogram/i.test(value || "") && !/\blb/i.test(value || "")) return Math.round(parsed * 2.20462);
  return Math.round(parsed);
}

export function classifyEngineeringAspiration(engine?: string | null): Aspiration {
  const value = engine || "";
  if (/battery electric|\belectric motor\b|\bev\b/i.test(value) && !/hybrid/i.test(value)) return "ELECTRIC";
  if (/hybrid|phev/i.test(value)) return "HYBRID";
  if (/turbo|supercharg|forced induction|boost/i.test(value)) return "FORCED_INDUCTION";
  if (/naturally aspirated|\bn\/?a\b/i.test(value)) return "NATURALLY_ASPIRATED";
  return "UNKNOWN";
}

export function classifyEngineeringDrivetrain(value?: string | null): DrivetrainLayout {
  if (!value) return "UNKNOWN";
  if (/\bawd\b|all[- ]wheel/i.test(value)) return "AWD";
  if (/\b4wd\b|\b4x4\b|four[- ]wheel/i.test(value)) return "4WD";
  if (/\bfwd\b|front[- ]wheel/i.test(value)) return "FWD";
  if (/\brwd\b|rear[- ]wheel|\bmr\b|\bfr\b|\brr\b/i.test(value)) return "RWD";
  return "UNKNOWN";
}

export function classifyEngineeringTransmission(value?: string | null): TransmissionType {
  if (!value) return "UNKNOWN";
  if (/dual[- ]clutch|\bdct\b|f1 transmission/i.test(value)) return "DCT";
  if (/\bcvt\b|continuously variable/i.test(value)) return "CVT";
  if (/sequential/i.test(value)) return "SEQUENTIAL";
  if (/single[- ]speed/i.test(value)) return "SINGLE_SPEED";
  if (/automatic|\ba\/t\b/i.test(value)) return "AUTOMATIC";
  if (/manual|\bm\/t\b/i.test(value)) return "MANUAL";
  return "UNKNOWN";
}

function firstPositiveNumber(value?: string | null) {
  const match = value?.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
