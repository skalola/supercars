import {
  evaluateRecommendationEligibility,
  type RecommendationVehicleProfile,
} from "./recommendation-eligibility";
import {
  buildVehiclePerformanceProfile,
  type InstalledPartForBuildProfile,
  type VehicleBuildProfile,
} from "./build-profile";
import { toBuildCategorySlug } from "./category-system";

type InstalledPartForRecommendation = InstalledPartForBuildProfile & {
  customName?: string | null;
  notes?: string | null;
};

type RecommendationCandidate = {
  id: string;
  name: string;
  estimatedHpGain: number | null;
  estimatedTorqueGain?: number | null;
  installComplexity?: string | null;
  description?: string | null;
  gainBasis?: string | null;
  category: { name: string; slug: string };
  catalogNode?: { name: string; slug: string } | null;
  compatibility: Array<{
    makeId?: string | null;
    modelId?: string | null;
    trim?: string | null;
    engine?: string | null;
    notes?: string | null;
  }>;
};

const CATEGORY_FOUNDATION_SCORE: Record<string, number> = {
  brakes: 24,
  "wheels-tires": 22,
  suspension: 20,
  cooling: 18,
  intake: 16,
  exhaust: 16,
  "ecu-tuning": 14,
  drivetrain: 12,
  fueling: 10,
  "interior-safety": 8,
  "aero-body": 6,
  "forced-induction": 2,
};

const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  intake: ["ecu-tuning", "exhaust", "cooling"],
  exhaust: ["ecu-tuning", "intake", "cooling"],
  "ecu-tuning": ["cooling", "fueling", "brakes", "drivetrain"],
  "forced-induction": ["cooling", "fueling", "ecu-tuning", "drivetrain", "brakes"],
  fueling: ["ecu-tuning", "forced-induction", "cooling"],
  cooling: ["ecu-tuning", "forced-induction"],
  suspension: ["wheels-tires", "brakes", "aero-body"],
  brakes: ["wheels-tires", "suspension"],
  "wheels-tires": ["brakes", "suspension"],
  "aero-body": ["suspension", "brakes"],
  drivetrain: ["ecu-tuning", "forced-induction", "cooling"],
  "interior-safety": ["brakes", "suspension"],
};

export function rankBuildAwarePartRecommendations<T extends RecommendationCandidate>({
  candidates,
  installedParts,
  vehicle,
  limit = 3,
}: {
  candidates: T[];
  installedParts: InstalledPartForRecommendation[];
  vehicle: RecommendationVehicleProfile;
  limit?: number;
}): Array<T & { recommendationReason: string; recommendationScore: number }> {
  if (limit <= 0) return [];

  const buildProfile = buildVehiclePerformanceProfile(vehicle, installedParts);
  const supportingSystemCount = ["ecu-tuning", "fueling", "cooling"].filter((category) =>
    buildProfile.installedCategories.has(category),
  ).length;

  const scored = candidates
    .filter((part) => {
      if (!evaluateRecommendationEligibility(part, vehicle).eligible) return false;
      const category = getCandidateBuildCategory(part);
      if (category !== "forced-induction" || buildProfile.aspiration === "FORCED_INDUCTION") return true;
      return supportingSystemCount >= 2;
    })
    .map((part) => {
      const category = getCandidateBuildCategory(part);
      const complementingCategories = [...buildProfile.installedCategories].filter((installedCategory) =>
        COMPLEMENTARY_CATEGORIES[installedCategory]?.includes(category),
      );
      const exactModelFitment = part.compatibility.some((fitment) => Boolean(fitment.modelId));
      let score = CATEGORY_FOUNDATION_SCORE[category] ?? 4;

      score += exactModelFitment ? 30 : 12;
      score += complementingCategories.length * 24;
      score += buildProfile.installedCategories.has(category) ? -24 : 16;
      if (buildProfile.supportNeeds.has(category)) score += 38;
      score += getVehicleSpecPriority(category, buildProfile);
      score += getDocumentedGainScore(part, buildProfile);

      return {
        ...part,
        recommendationCategory: category,
        recommendationScore: score,
        recommendationReason: buildRecommendationReason({
          category,
          exactModelFitment,
          complementingCategories,
          buildProfile,
          partHpGain: part.estimatedHpGain,
          partTorqueGain: part.estimatedTorqueGain,
          hasGainBasis: Boolean(part.gainBasis),
        }),
      };
    })
    .sort((left, right) =>
      right.recommendationScore - left.recommendationScore ||
      left.category.name.localeCompare(right.category.name) ||
      left.name.localeCompare(right.name),
    );

  const recommendations: typeof scored = [];
  const selectedCategories = new Set<string>();

  for (const part of scored) {
    if (recommendations.length >= limit) break;
    if (selectedCategories.has(part.recommendationCategory)) continue;
    recommendations.push(part);
    selectedCategories.add(part.recommendationCategory);
  }

  for (const part of scored) {
    if (recommendations.length >= limit) break;
    if (recommendations.some((selected) => selected.id === part.id)) continue;
    recommendations.push(part);
  }

  return recommendations;
}

export function describeVehicleBuild(profile: VehicleBuildProfile, nextCategory?: string | null) {
  const installedLabels = [...profile.installedLabels.values()];
  const strength = buildStrength(profile, installedLabels);
  const priority = nextCategory || [...profile.supportNeeds][0] || null;
  const weakness = buildWeakness(profile, priority);
  return { strength, weakness };
}

function buildStrength(profile: VehicleBuildProfile, installedLabels: string[]) {
  if (profile.stage === "STOCK") {
    return "The car is still close to its factory setup, so power, grip, braking, and cooling remain balanced and predictable.";
  }

  const systems = installedLabels.slice(0, 2).join(" and ");
  if (profile.stage === "BOLT_ON") {
    return systems
      ? `The recorded ${systems} upgrades add a focused improvement without pushing the rest of the car far beyond stock.`
      : "The recorded upgrades add a focused improvement while keeping the overall build relatively mild.";
  }
  if (profile.stage === "TUNED") {
    return systems
      ? `The ${systems} upgrades now work as a coordinated performance package instead of isolated changes.`
      : "The recorded power upgrades now work as a coordinated package instead of isolated changes.";
  }
  return "The build has meaningful power gains and a strong performance foundation; supporting systems now matter more than another isolated power part.";
}

function buildWeakness(profile: VehicleBuildProfile, category: string | null) {
  const byCategory: Record<string, string> = {
    "ecu-tuning": "Power-related hardware is recorded, but engine management is not. The upgrades may not work together as efficiently as they could.",
    cooling: "The build can create more heat than the factory setup, while no matching cooling improvement is recorded.",
    brakes: "The car can carry more speed, but no matching braking upgrade is recorded to help manage it repeatedly.",
    drivetrain: "More torque is reaching the wheels, but no drivetrain support is recorded to manage that extra load.",
    "wheels-tires": "The car has more performance available than the recorded tire and traction setup may be able to use consistently.",
    fueling: "The power setup may need more fuel delivery capacity, but no supporting fuel-system upgrade is recorded.",
    suspension: "The chassis is still relying on its current suspension setup, which may limit control before more power is useful.",
    intake: "The engine is still using its current airflow path, leaving a straightforward response improvement available.",
    exhaust: "The engine is still using its current exhaust path, which can limit flow and response improvements.",
  };
  if (category && byCategory[category]) return byCategory[category];
  if (profile.stage === "STOCK") {
    return "No performance upgrades are recorded yet, so building grip, braking, or chassis control is the safest first step before adding power.";
  }
  return "No major imbalance is visible from the recorded modifications. The next upgrade should complement the systems already installed.";
}

function getCandidateBuildCategory(part: RecommendationCandidate) {
  return toBuildCategorySlug(
    part.category.slug,
    `${part.name} ${part.description || ""} ${part.catalogNode?.name || ""} ${part.catalogNode?.slug || ""}`,
  );
}

function buildRecommendationReason({
  category,
  exactModelFitment,
  complementingCategories,
  buildProfile,
  partHpGain,
  partTorqueGain,
  hasGainBasis,
}: {
  category: string;
  exactModelFitment: boolean;
  complementingCategories: string[];
  buildProfile: VehicleBuildProfile;
  partHpGain: number | null;
  partTorqueGain?: number | null;
  hasGainBasis: boolean;
}) {
  if (buildProfile.supportNeeds.has(category)) {
    return supportReason(category, buildProfile);
  }

  if (complementingCategories.length > 0) {
    const labels = complementingCategories
      .slice(0, 2)
      .map((installedCategory) => buildProfile.installedLabels.get(installedCategory) || titleFromSlug(installedCategory));
    return `Complements your installed ${labels.join(" and ")}.`;
  }

  if (hasGainBasis && ((partHpGain ?? 0) > 0 || (partTorqueGain ?? 0) > 0)) {
    const gains = [
      partHpGain ? `+${partHpGain} hp` : null,
      partTorqueGain ? `+${partTorqueGain} lb-ft` : null,
    ].filter(Boolean);
    return `Documented ${gains.join(" and ")} for this upgrade path.`;
  }

  const foundationReason: Record<string, string> = {
    brakes: "Adds braking capacity before further power upgrades.",
    "wheels-tires": "Builds a traction foundation for future performance upgrades.",
    suspension: "Improves chassis control as a foundation for the build.",
    cooling: "Adds thermal support for sustained performance use.",
  };
  if (buildProfile.stage === "STOCK" && foundationReason[category]) return foundationReason[category];
  if (exactModelFitment) return "Prioritized for its verified model-specific fitment.";
  return "Selected as the next complementary system in this build path.";
}

function getVehicleSpecPriority(category: string, profile: VehicleBuildProfile) {
  let score = 0;
  if (profile.stage === "STOCK" && ["brakes", "wheels-tires", "suspension"].includes(category)) score += 12;
  if (
    category === "ecu-tuning" &&
    ["intake", "exhaust", "forced-induction", "fueling"].some((item) => profile.installedCategories.has(item))
  ) score += 12;
  if (profile.aspiration === "FORCED_INDUCTION" && ["cooling", "fueling", "ecu-tuning"].includes(category)) score += 16;
  if (profile.drivetrain === "FWD" && ["wheels-tires", "drivetrain"].includes(category)) score += 8;
  if (profile.stage === "HIGH_OUTPUT" && ["brakes", "cooling", "drivetrain", "wheels-tires"].includes(category)) score += 18;
  return score;
}

function getDocumentedGainScore(part: RecommendationCandidate, profile: VehicleBuildProfile) {
  const hpGain = part.estimatedHpGain ?? 0;
  const torqueGain = part.estimatedTorqueGain ?? 0;
  const relativeHpGain = profile.stockHorsepower ? hpGain / profile.stockHorsepower : 0;
  const relativeTorqueGain = profile.stockTorque ? torqueGain / profile.stockTorque : 0;
  let score = Math.min(14, Math.round(Math.max(relativeHpGain, relativeTorqueGain) * 100));
  if (part.gainBasis && (hpGain > 0 || torqueGain > 0)) score += 8;
  return score;
}

function supportReason(category: string, profile: VehicleBuildProfile) {
  const reasonByCategory: Record<string, string> = {
    "ecu-tuning": "Coordinates the power parts already recorded in this build.",
    cooling: `Adds thermal support for this ${stageLabel(profile.stage)} build.`,
    brakes: `Adds braking capacity for this ${stageLabel(profile.stage)} output level.`,
    drivetrain: profile.drivetrain === "FWD"
      ? "Improves power delivery and traction for this front-wheel-drive build."
      : "Supports the added torque recorded in this build.",
    "wheels-tires": "Adds the traction needed for the build's current output.",
    fueling: "Adds fuel-system capacity required by the forced-induction setup.",
  };
  return reasonByCategory[category] || "Supports the next requirement in this build path.";
}

function stageLabel(stage: VehicleBuildProfile["stage"]) {
  return stage.toLowerCase().replace("_", "-");
}

function titleFromSlug(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
