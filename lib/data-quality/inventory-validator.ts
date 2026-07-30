export type FreshnessStatus = "ACTIVE" | "STALE" | "REMOVED";
export type SourceConfidence = "HIGH" | "MEDIUM" | "LOW";

/**
 * Normalizes model names into base representations for comparison.
 * Collapses accents, punctuation, spacing, common trims, and special editions.
 */
export function normalizeModelToMatchName(name: string): string {
  if (!name) return "";
  let norm = name.toLowerCase().trim();

  // Strip accents (e.g. Huracán -> huracan)
  norm = norm.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Remove brand prefixes
  norm = norm.replace(/^(ferrari|lamborghini|mclaren|mcclaren)\s+/gi, "");

  // Replace symbols/punctuation with spaces
  norm = norm.replace(/[^a-z0-9\s]/gi, " ");

  // Collapse spaces
  norm = norm.replace(/\s+/g, " ").trim();

  // Map to base models for matching purposes (does not overwrite stored trim detail)
  if (norm.includes("huracan")) return "huracan";
  if (norm.includes("aventador")) return "aventador";
  if (norm.includes("gallardo")) return "gallardo";
  if (norm.includes("murcielago")) return "murcielago";
  if (norm.includes("diablo")) return "diablo";
  if (norm.includes("countach")) return "countach";
  if (norm.includes("revuelto")) return "revuelto";
  if (norm.includes("temerario")) return "temerario";
  if (norm.includes("urus")) return "urus";
  if (norm.includes("california")) return "california";
  if (norm.includes("portofino")) return "portofino";
  if (norm.includes("roma")) return "roma";
  if (norm.includes("testarossa")) return "testarossa";
  if (norm.includes("12cilindri")) return "12cilindri";
  if (norm.includes("550")) return "550";
  if (norm.includes("599")) return "599";
  if (norm.includes("612")) return "612";
  if (norm.includes("328")) return "328";
  if (norm.includes("308")) return "308";
  if (norm.includes("458")) return "458";
  if (norm.includes("488")) return "488";
  if (norm.includes("f8")) return "f8";
  if (norm.includes("812")) return "812";
  if (norm.includes("296")) return "296";
  if (norm.includes("sf90")) return "sf90";
  if (norm.includes("f430")) return "f430";
  if (norm.includes("f355")) return "f355";
  if (norm.includes("360") || norm.includes("challenge stradale")) return "360";
  if (norm.includes("mp4 12c") || norm.includes("12c")) return "mp4-12c";
  if (norm.includes("570s")) return "570s";
  if (norm.includes("570gt")) return "570gt";
  if (norm.includes("600lt")) return "600lt";
  if (norm.includes("650s")) return "650s";
  if (norm.includes("675lt")) return "675lt";
  if (norm.includes("720s")) return "720s";
  if (norm.includes("750s")) return "750s";
  if (norm.includes("765lt")) return "765lt";
  if (norm.includes("artura")) return "artura";
  if (norm.includes("gts")) return "gts";
  if (norm.includes("w1")) return "w1";
  if (norm.includes("senna")) return "senna";
  if (norm.includes("speedtail")) return "speedtail";
  if (norm.includes("elva")) return "elva";

  // General slug representation
  return norm.replace(/\s+/g, "-");
}

export function normalizeModelName(name: string): string {
  return normalizeModelToMatchName(name);
}

/**
 * Checks if a given input model name matches a target DB model name/slug.
 */
export function isModelMatch(dbModelName: string, dbModelSlug: string, inputModelName: string): boolean {
  const normDbSlug = normalizeModelToMatchName(dbModelSlug);
  const normDbName = normalizeModelToMatchName(dbModelName);
  const normInput = normalizeModelToMatchName(inputModelName);

  return (
    normDbSlug === normInput ||
    normDbName === normInput ||
    normInput.includes(normDbSlug) ||
    normDbSlug.includes(normInput) ||
    normInput.includes(normDbName) ||
    normDbName.includes(normInput)
  );
}

/**
 * Tracks inventory age and flags stale records (last seen > 30 days ago).
 */
export function getFreshnessStatus(status: string, lastSeen: Date): FreshnessStatus {
  if (status === "SOLD" || status === "REMOVED") {
    return "REMOVED";
  }
  const ageInMs = Date.now() - new Date(lastSeen).getTime();
  const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
  if (ageInDays > 30) {
    return "STALE";
  }
  return "ACTIVE";
}

/**
 * Determines source reliability based on source type.
 */
export function getSourceConfidence(type: string | null): SourceConfidence {
  if (!type) return "LOW";
  const t = type.toUpperCase();
  if (t === "DEALER" || t === "AUCTION") return "HIGH";
  if (t === "MARKETPLACE") return "MEDIUM";
  return "LOW";
}

export type InventoryStatus = "VALID" | "WARNING" | "NEEDS_REVIEW" | "REMOVED";

/**
 * Resolves final inventory status based on data quality validation parameters.
 */
export function resolveInventoryStatus(params: {
  isDuplicate?: boolean;
  isInvalidVin?: boolean;
  vinIdentityStatus?: string;
  mileageStatus?: string;
  imageValidationStatus?: string;
  priceStatus?: string;
  vinIdentityClassification?: string;
}): InventoryStatus {
  if (params.isDuplicate || params.isInvalidVin) {
    return "REMOVED";
  }

  // True VIN mismatch, make conflict, or year conflict
  if (
    params.vinIdentityClassification === "TRUE_IDENTITY_CONFLICT" ||
    params.vinIdentityClassification === "MAKE_CONFLICT" ||
    params.vinIdentityClassification === "YEAR_CONFLICT" ||
    params.priceStatus === "PRICE_INVALID"
  ) {
    return "NEEDS_REVIEW";
  }

  // Trim mismatch or minor naming variation, missing optional data (mileage/images)
  if (
    params.vinIdentityClassification === "TRIM_VARIATION" ||
    params.vinIdentityClassification === "MODEL_NAMING_VARIATION" ||
    params.mileageStatus === "MISSING_MILEAGE" ||
    params.imageValidationStatus === "IMAGE_UNVERIFIED"
  ) {
    return "WARNING";
  }

  return "VALID";
}

export type IdentityConflictClassification =
  | "VALID"
  | "MODEL_NAMING_VARIATION"
  | "TRIM_VARIATION"
  | "TRUE_IDENTITY_CONFLICT"
  | "YEAR_CONFLICT"
  | "MAKE_CONFLICT";

/**
 * Classifies exact vehicle relationship checks against NHTSA VIN decoded properties.
 */
export function classifyVinIdentityConflict(params: {
  dbMake: string;
  dbModel: string;
  dbYear: number;
  decodedMake: string;
  decodedModel: string;
  decodedYear: number;
  sourceMake: string;
  sourceModel: string;
}): IdentityConflictClassification {
  const dm = params.dbMake.toLowerCase().trim();
  const dmo = params.dbModel.toLowerCase().trim();
  const dy = params.dbYear;

  const decM = params.decodedMake.toLowerCase().trim();
  const decMo = params.decodedModel.toLowerCase().trim();
  const decY = params.decodedYear;

  // 1. Make Conflict
  if (dm !== decM && !decM.includes(dm) && !dm.includes(decM)) {
    return "MAKE_CONFLICT";
  }

  // 2. Year Conflict
  if (dy !== decY) {
    return "YEAR_CONFLICT";
  }

  // 3. Perfect Match
  if (isModelMatch(params.dbModel, params.dbModel.toLowerCase().replace(/[^a-z0-9]/g, "-"), params.decodedModel)) {
    const normDb = normalizeModelToMatchName(params.dbModel);
    const normDec = normalizeModelToMatchName(params.decodedModel);
    const normSource = normalizeModelToMatchName(params.sourceModel);

    if (normDb === normDec && normDb === normSource && (params.dbModel !== params.decodedModel || params.dbModel !== params.sourceModel)) {
      if (
        params.dbModel.includes("evo") ||
        params.decodedModel.includes("evo") ||
        params.sourceModel.includes("evo") ||
        params.dbModel.includes("coupe") ||
        params.decodedModel.includes("coupe") ||
        params.sourceModel.includes("coupe")
      ) {
        return "MODEL_NAMING_VARIATION";
      }
      return "TRIM_VARIATION";
    }
    return "VALID";
  }

  // 4. Model Naming / Trim Variation Check
  const normDb = normalizeModelToMatchName(params.dbModel);
  const normDec = normalizeModelToMatchName(params.decodedModel);
  const normSource = normalizeModelToMatchName(params.sourceModel);

  if (normDb === normDec || normDec.includes(normDb) || normDb.includes(normDec)) {
    if (
      params.dbModel.includes("evo") ||
      params.decodedModel.includes("evo") ||
      params.sourceModel.includes("evo") ||
      params.dbModel.includes("coupe") ||
      params.decodedModel.includes("coupe") ||
      params.sourceModel.includes("coupe")
    ) {
      return "MODEL_NAMING_VARIATION";
    }
    return "TRIM_VARIATION";
  }

  // 5. True Identity Mismatch
  return "TRUE_IDENTITY_CONFLICT";
}
