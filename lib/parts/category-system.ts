const FORCED_INDUCTION_PATTERN = /\b(turbo(?:charger|charged)?|supercharger|boost(?: controller)?|intercooler|charge pipe|wastegate|blow[- ]off|compressor wheel)\b/i;
const AERODYNAMIC_PATTERN = /\b(splitter|diffuser|wing|spoiler|canard|undertray|aero)\b/i;

const LEGACY_TO_STORAGE_SYSTEM: Record<string, string> = {
  maintenance: "maintenance-service",
  intake: "air-induction",
  exhaust: "exhaust-emissions",
  "ecu-tuning": "ecu-electronics",
  "forced-induction": "air-induction",
  fueling: "fuel-system",
  drivetrain: "transmission-drivetrain",
  transmission: "transmission-drivetrain",
  suspension: "suspension-steering",
  steering: "suspension-steering",
  "aero-body": "aerodynamics",
  "interior-safety": "interior",
  "performance-modifications": "performance-packages",
};

/** Maps historical UI/import slugs to the canonical system stored in Postgres. */
export function toStoragePartSystemSlug(categorySlug: string) {
  return LEGACY_TO_STORAGE_SYSTEM[categorySlug] ?? categorySlug;
}

/**
 * Converts broad storage systems into the functional vocabulary used by build
 * intelligence. Part text keeps forced induction distinct from ordinary intake.
 */
export function toBuildCategorySlug(categorySlug: string, partText = "") {
  switch (categorySlug) {
    case "maintenance-service": return "maintenance";
    case "air-induction": return FORCED_INDUCTION_PATTERN.test(partText) ? "forced-induction" : "intake";
    case "fuel-system": return "fueling";
    case "exhaust-emissions": return "exhaust";
    case "ecu-electronics": return "ecu-tuning";
    case "transmission-drivetrain": return "drivetrain";
    case "suspension-steering": return "suspension";
    case "body-exterior": return AERODYNAMIC_PATTERN.test(partText) ? "aero-body" : "body-exterior";
    case "aerodynamics": return "aero-body";
    case "interior": return "interior-safety";
    case "performance-packages":
      if (FORCED_INDUCTION_PATTERN.test(partText)) return "forced-induction";
      if (/\b(tune|ecu|calibration)\b/i.test(partText)) return "ecu-tuning";
      if (/\bexhaust\b/i.test(partText)) return "exhaust";
      return "performance-packages";
    default: return categorySlug;
  }
}

export function storageSystemAliases(categorySlug: string) {
  const storageSlug = toStoragePartSystemSlug(categorySlug);
  return Object.entries(LEGACY_TO_STORAGE_SYSTEM)
    .filter(([, target]) => target === storageSlug)
    .map(([alias]) => alias);
}
