export type RecommendationVehicleProfile = {
  engine?: string | null;
  transmission?: string | null;
  trim?: string | null;
  drivetrain?: string | null;
  forcedInduction?: string | null;
  stockHorsepower?: string | number | null;
  stockTorque?: string | number | null;
};

export type RecommendationEligibilityCandidate = {
  name: string;
  description?: string | null;
  catalogNode?: { name: string; slug: string } | null;
  compatibility: Array<{
    trim?: string | null;
    engine?: string | null;
    notes?: string | null;
  }>;
};

type TransmissionKind = "AUTOMATIC" | "MANUAL" | "UNKNOWN";
type DrivetrainKind = "FWD" | "RWD" | "AWD" | "UNKNOWN";

type EligibilityRule = {
  id: string;
  evaluate: (
    part: RecommendationEligibilityCandidate,
    vehicle: RecommendationVehicleProfile,
  ) => { eligible: boolean; reason?: string };
};

const MANUAL_PART_PATTERN = /\b(manual transmission|short[- ]?shift(?:er)?|billet shifter|clutch (?:kit|disc|plate)|flywheel)\b/i;
const AUTOMATIC_PART_PATTERN = /\b(automatic transmission|automatic trans|cvt|dual[- ]clutch|dct|pdk)\b/i;

const ELIGIBILITY_RULES: EligibilityRule[] = [
  {
    id: "transmission-match",
    evaluate(part, vehicle) {
      const vehicleTransmission = classifyTransmission(vehicle.transmission);
      if (vehicleTransmission === "UNKNOWN") return { eligible: true };

      const requirement = getPartTransmissionRequirement(part);
      if (requirement === "UNKNOWN" || requirement === vehicleTransmission) return { eligible: true };

      return {
        eligible: false,
        reason: `Requires a ${requirement.toLowerCase()} transmission.`,
      };
    },
  },
  {
    id: "drivetrain-match",
    evaluate(part, vehicle) {
      const requirement = getPartDrivetrainRequirement(part);
      if (requirement === "UNKNOWN") return { eligible: true };

      const vehicleDrivetrain = classifyDrivetrain(vehicle.drivetrain);
      if (vehicleDrivetrain === requirement) return { eligible: true };
      return {
        eligible: false,
        reason: vehicleDrivetrain === "UNKNOWN"
          ? "Requires confirmed drivetrain fitment."
          : `Requires a ${requirement} drivetrain.`,
      };
    },
  },
  {
    id: "trim-match",
    evaluate(part, vehicle) {
      const requiredTrims = part.compatibility
        .map((fitment) => fitment.trim?.trim())
        .filter((trim): trim is string => Boolean(trim));
      const needsTrimConfirmation = part.compatibility.some((fitment) =>
        /\b(?:verify|confirm)\s+(?:the\s+)?trim\b|\btrim[- ]specific\b/i.test(fitment.notes || ""),
      );

      if (requiredTrims.length === 0 && !needsTrimConfirmation) return { eligible: true };
      if (!vehicle.trim?.trim()) {
        return { eligible: false, reason: "Requires confirmed trim fitment." };
      }

      if (requiredTrims.length === 0) return { eligible: true };
      const vehicleTrim = normalizeFitmentValue(vehicle.trim);
      const matches = requiredTrims.some((trim) => {
        const requiredTrim = normalizeFitmentValue(trim);
        return vehicleTrim === requiredTrim || vehicleTrim.includes(requiredTrim) || requiredTrim.includes(vehicleTrim);
      });
      return matches
        ? { eligible: true }
        : { eligible: false, reason: "Does not match the vehicle trim." };
    },
  },
];

export function evaluateRecommendationEligibility(
  part: RecommendationEligibilityCandidate,
  vehicle: RecommendationVehicleProfile,
) {
  for (const rule of ELIGIBILITY_RULES) {
    const result = rule.evaluate(part, vehicle);
    if (!result.eligible) return { ...result, ruleId: rule.id };
  }

  return { eligible: true, ruleId: null, reason: null };
}

function getPartTransmissionRequirement(part: RecommendationEligibilityCandidate): TransmissionKind {
  const fitmentText = part.compatibility
    .flatMap((fitment) => [fitment.notes, fitment.trim, fitment.engine])
    .filter(Boolean)
    .join(" ");
  const descriptiveText = [part.name, part.description, part.catalogNode?.name, part.catalogNode?.slug]
    .filter(Boolean)
    .join(" ");
  const combinedText = `${fitmentText} ${descriptiveText}`;

  if (MANUAL_PART_PATTERN.test(combinedText)) return "MANUAL";
  if (AUTOMATIC_PART_PATTERN.test(combinedText)) return "AUTOMATIC";
  return "UNKNOWN";
}

function getPartDrivetrainRequirement(part: RecommendationEligibilityCandidate): DrivetrainKind {
  const text = part.compatibility
    .flatMap((fitment) => [fitment.notes, fitment.trim, fitment.engine])
    .filter(Boolean)
    .join(" ");
  if (/\b(?:awd|all[- ]wheel|4wd)(?:\s+(?:only|fitment))\b/i.test(text)) return "AWD";
  if (/\b(?:fwd|front[- ]wheel)(?:\s+(?:only|fitment))\b/i.test(text)) return "FWD";
  if (/\b(?:rwd|rear[- ]wheel)(?:\s+(?:only|fitment))\b/i.test(text)) return "RWD";
  return "UNKNOWN";
}

function classifyTransmission(value?: string | null): TransmissionKind {
  if (!value) return "UNKNOWN";
  if (/\b(manual|stick|mt)\b/i.test(value)) return "MANUAL";
  if (/\b(automatic|auto|cvt|dct|dual[- ]clutch|pdk|tiptronic|e-gear|f1)\b/i.test(value)) return "AUTOMATIC";
  return "UNKNOWN";
}

function classifyDrivetrain(value?: string | null): DrivetrainKind {
  if (!value) return "UNKNOWN";
  if (/\b(awd|all[- ]wheel|4wd|4x4)\b/i.test(value)) return "AWD";
  if (/\b(fwd|front[- ]wheel)\b/i.test(value)) return "FWD";
  if (/\b(rwd|rear[- ]wheel)\b/i.test(value)) return "RWD";
  return "UNKNOWN";
}

function normalizeFitmentValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
