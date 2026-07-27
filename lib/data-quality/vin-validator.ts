import { decodeVin } from "../market-crawlers/crawler-engine";
import { isModelMatch, normalizeModelToMatchName } from "./inventory-validator";

export type VinValidationStatus = "VALID" | "MODEL_MISMATCH" | "YEAR_MISMATCH" | "MAKE_MISMATCH";

/**
 * Validates stored vehicle make, model, and year against VIN-decoded fields.
 *
 * Uses normalised base model names for comparison so that legitimate trim-level
 * differences (e.g. "488 GTB" vs "488", "SF90 Stradale" vs "SF90",
 * "Portofino M" vs "Portofino") do NOT produce a MODEL_MISMATCH.
 * Only genuine cross-model mismatches (e.g. Aventador vs Urus) are flagged.
 */
export async function validateVinIdentity(
  vin: string,
  storedMake: string,
  storedModel: string,
  storedYear: number
): Promise<{
  status: VinValidationStatus;
  decodedMake?: string;
  decodedModel?: string;
  decodedYear?: number;
  reason?: string;
}> {
  const decoded = await decodeVin(vin);
  if (!decoded || !decoded.make || !decoded.model || !decoded.year) {
    return { status: "VALID", reason: "VIN decoding unavailable or incomplete" };
  }

  const decMake = String(decoded.make).trim();
  const decModel = String(decoded.model).trim();
  const decYear = Number(decoded.year);

  // ── Make check (case-insensitive substring) ─────────────────────────────
  const decMakeLower = decMake.toLowerCase();
  const storedMakeLower = storedMake.toLowerCase();
  if (!decMakeLower.includes(storedMakeLower) && !storedMakeLower.includes(decMakeLower)) {
    return {
      status: "MAKE_MISMATCH",
      decodedMake: decMake,
      decodedModel: decModel,
      decodedYear: decYear,
      reason: `Make mismatch: VIN decoded "${decMake}", stored "${storedMake}"`
    };
  }

  // ── Model check using normalised base names ──────────────────────────────
  // Normalise both sides to their base model identifier before comparing.
  // This means "488 GTB" and "488" both normalise to "488" → no mismatch.
  const normStored = normalizeModelToMatchName(storedModel);
  const normDecoded = normalizeModelToMatchName(decModel);

  // Also keep the slug-based fallback for models not covered by the base map.
  const dbSlug = storedModel.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");

  const modelsMatch =
    normStored === normDecoded ||
    normStored.includes(normDecoded) ||
    normDecoded.includes(normStored) ||
    isModelMatch(storedModel, dbSlug, decModel);

  if (!modelsMatch) {
    return {
      status: "MODEL_MISMATCH",
      decodedMake: decMake,
      decodedModel: decModel,
      decodedYear: decYear,
      reason: `Model mismatch: VIN decoded "${decModel}" (norm: ${normDecoded}), stored "${storedModel}" (norm: ${normStored})`
    };
  }

  // ── Year check ───────────────────────────────────────────────────────────
  if (decYear !== storedYear) {
    return {
      status: "YEAR_MISMATCH",
      decodedMake: decMake,
      decodedModel: decModel,
      decodedYear: decYear,
      reason: `Year mismatch: VIN decoded ${decYear}, stored ${storedYear}`
    };
  }

  return { status: "VALID" };
}

/**
 * Validates if the VIN matches general length and character constraints.
 */
export function isInvalidVin(vin: string): boolean {
  if (!vin) return true;
  const cleanVin = vin.trim().toUpperCase();
  if (cleanVin.length !== 17) return true;
  if (/[IOQ]/i.test(cleanVin)) return true;
  return false;
}
