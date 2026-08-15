export type UniversalApplicabilityStatus = "APPLICABLE" | "NOT_APPLICABLE" | "VARIANT_DEPENDENT" | "YEAR_DEPENDENT";
export type UniversalApplicabilityConfidence = "HIGH" | "MEDIUM" | "LOW";

export type UniversalPartTypeInput = {
  id?: string;
  name: string;
  slug: string;
  systemSlug: string;
  fitmentRisk?: string | null;
};

export type UniversalVehicleProfile = {
  makeSlug: string;
  modelSlug: string;
  modelName: string;
  productionStartYear?: number | null;
  productionEndYear?: number | null;
  engine?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  bodyStyle?: string | null;
  variantCount?: number;
};

export type ApplicabilityCandidate = {
  status: UniversalApplicabilityStatus;
  confidence: UniversalApplicabilityConfidence;
  publiclyApplicable: boolean;
  source: "UNIVERSAL_RULE";
  reason: string;
  reviewRequired: boolean;
};

export type ApplicabilityOverride = {
  overrideStatus: UniversalApplicabilityStatus;
  reason: string;
  source?: string | null;
};

export function evaluateUniversalPartApplicability(
  partType: UniversalPartTypeInput,
  vehicle: UniversalVehicleProfile,
): ApplicabilityCandidate {
  const name = normalize(partType.name);
  const engine = normalize(vehicle.engine || "");
  const transmission = normalize(vehicle.transmission || "");
  const turboPart = /turbocharger|intercooler|wastegate|boost controller|blow off|charge pipe|turbo inlet/.test(name);
  const hybridPart = /hybrid battery|hybrid control/.test(name);
  const automatedPart = /paddle shifter|tcu tune|transmission controller/.test(name);
  const modernPart = /^ecu$|ecu tune|piggyback|control module|infotainment/.test(name);

  if (turboPart) {
    if (/naturally aspirated|\bna\b/.test(engine) && !/turbo|supercharg/.test(engine)) return result("NOT_APPLICABLE", "HIGH", "Forced-induction part conflicts with naturally aspirated engine metadata.");
    if (/turbo/.test(engine)) return result("APPLICABLE", "HIGH", "Turbocharged engine metadata supports this part type.");
    return result("VARIANT_DEPENDENT", "LOW", "Aspiration must be confirmed before this part type is published.");
  }
  if (hybridPart) {
    if (/hybrid|electric motor|phev/.test(engine)) return result("APPLICABLE", "HIGH", "Electrified powertrain metadata supports this part type.");
    if (engine) return result("NOT_APPLICABLE", "MEDIUM", "No hybrid powertrain evidence is present.");
    return result("VARIANT_DEPENDENT", "LOW", "Powertrain must be confirmed.");
  }
  if (automatedPart) {
    if (/manual/.test(transmission) && !/automatic|automated|dual clutch|dct|f1/.test(transmission)) return result("NOT_APPLICABLE", "HIGH", "Manual-only transmission metadata conflicts with this control.");
    if (/automatic|automated|dual clutch|dct|f1/.test(transmission)) return result("APPLICABLE", "HIGH", "Transmission metadata supports this part type.");
    return result("VARIANT_DEPENDENT", "LOW", "Transmission variant must be confirmed.");
  }
  if (modernPart && (vehicle.productionEndYear ?? vehicle.productionStartYear ?? 0) < 1990) {
    return result("NOT_APPLICABLE", "HIGH", "Production years predate this electronic component class.");
  }
  if (modernPart && (vehicle.productionStartYear ?? 9999) < 1990) {
    return result("YEAR_DEPENDENT", "MEDIUM", "Applicability changes across the model production range.");
  }
  if (/carbon ceramic/.test(name)) return result("VARIANT_DEPENDENT", "LOW", "Brake material or option code must be confirmed.");
  if (/oil filter|spark plug|ignition coil|fuel injector/.test(name) && /electric|bev/.test(engine)) {
    return result("NOT_APPLICABLE", "HIGH", "Combustion service part conflicts with electric powertrain metadata.");
  }
  if (partType.fitmentRisk === "HIGH") return result("APPLICABLE", "MEDIUM", "The part class is plausible, but exact product fitment remains supplier-validated.", true);
  return result("APPLICABLE", "HIGH", "Universal automotive rule supports this part type for the vehicle class.");
}

export function applyApplicabilityOverride(candidate: ApplicabilityCandidate, override?: ApplicabilityOverride | null): ApplicabilityCandidate {
  if (!override) return candidate;
  return {
    status: override.overrideStatus,
    confidence: "HIGH",
    publiclyApplicable: override.overrideStatus === "APPLICABLE",
    source: "UNIVERSAL_RULE",
    reason: `Override${override.source ? ` (${override.source})` : ""}: ${override.reason}`,
    reviewRequired: false,
  };
}

function result(status: UniversalApplicabilityStatus, confidence: UniversalApplicabilityConfidence, reason: string, forceReview = false): ApplicabilityCandidate {
  return {
    status,
    confidence,
    publiclyApplicable: status === "APPLICABLE" && confidence !== "LOW",
    source: "UNIVERSAL_RULE",
    reason,
    reviewRequired: forceReview || status === "VARIANT_DEPENDENT" || status === "YEAR_DEPENDENT" || confidence === "LOW",
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
