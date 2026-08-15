import { parsePerformanceNumber, summarizeInstalledPartGains } from "./performance";
import type { RecommendationVehicleProfile } from "./recommendation-eligibility";
import { toBuildCategorySlug } from "./category-system";
import type {
  Aspiration,
  BuildStage,
  DrivetrainLayout,
} from "./engineering-contract";

export type { Aspiration, BuildStage, DrivetrainLayout } from "./engineering-contract";

export type InstalledPartForBuildProfile = {
  hpGainOverride?: number | null;
  torqueGainOverride?: number | null;
  category?: { name: string; slug: string } | null;
  part?: {
    name?: string;
    estimatedHpGain?: number | null;
    estimatedTorqueGain?: number | null;
    category: { name: string; slug: string };
  } | null;
};

export type VehicleBuildProfile = {
  stage: BuildStage;
  aspiration: Aspiration;
  drivetrain: DrivetrainLayout;
  stockHorsepower: number | null;
  stockTorque: number | null;
  recordedHpGain: number;
  recordedTorqueGain: number;
  hpGainRatio: number | null;
  torqueGainRatio: number | null;
  installedCategories: Set<string>;
  installedLabels: Map<string, string>;
  supportNeeds: Set<string>;
};

const POWER_CATEGORIES = new Set(["intake", "exhaust", "ecu-tuning", "forced-induction", "fueling"]);

export function buildVehiclePerformanceProfile(
  vehicle: RecommendationVehicleProfile,
  installedParts: InstalledPartForBuildProfile[],
): VehicleBuildProfile {
  const installedCategories = new Set<string>();
  const installedLabels = new Map<string, string>();

  for (const installedPart of installedParts) {
    const category = installedPart.part?.category || installedPart.category;
    if (!category) continue;
    const partText = `${installedPart.part?.name || ""} ${installedPart.category?.name || ""}`;
    const functionalCategory = toBuildCategorySlug(category.slug, partText);
    installedCategories.add(functionalCategory);
    if (!installedLabels.has(functionalCategory)) installedLabels.set(functionalCategory, category.name);
  }

  const gains = summarizeInstalledPartGains(installedParts);
  const stockHorsepower = parsePerformanceNumber(vehicle.stockHorsepower);
  const stockTorque = parsePerformanceNumber(vehicle.stockTorque);
  const hpGainRatio = stockHorsepower && stockHorsepower > 0 ? gains.hpGain / stockHorsepower : null;
  const torqueGainRatio = stockTorque && stockTorque > 0 ? gains.torqueGain / stockTorque : null;
  const aspiration = classifyAspiration(vehicle);
  const drivetrain = classifyDrivetrain(vehicle.drivetrain);
  const installedPowerSystems = [...installedCategories].filter((category) => POWER_CATEGORIES.has(category)).length;

  let stage: BuildStage = "STOCK";
  if (installedParts.length > 0) stage = "BOLT_ON";
  if (installedCategories.has("ecu-tuning") || installedPowerSystems >= 2 || (hpGainRatio ?? 0) >= 0.1) stage = "TUNED";
  if (
    installedCategories.has("forced-induction") ||
    (hpGainRatio ?? 0) >= 0.25 ||
    (torqueGainRatio ?? 0) >= 0.25 ||
    (stockHorsepower === null && gains.hpGain >= 100)
  ) {
    stage = "HIGH_OUTPUT";
  }

  const supportNeeds = determineSupportNeeds({
    stage,
    aspiration,
    drivetrain,
    hpGainRatio,
    installedPowerSystems,
    installedCategories,
  });

  return {
    stage,
    aspiration,
    drivetrain,
    stockHorsepower,
    stockTorque,
    recordedHpGain: gains.hpGain,
    recordedTorqueGain: gains.torqueGain,
    hpGainRatio,
    torqueGainRatio,
    installedCategories,
    installedLabels,
    supportNeeds,
  };
}

function determineSupportNeeds({
  stage,
  aspiration,
  drivetrain,
  hpGainRatio,
  installedPowerSystems,
  installedCategories,
}: Pick<VehicleBuildProfile, "stage" | "aspiration" | "drivetrain" | "hpGainRatio" | "installedCategories"> & {
  installedPowerSystems: number;
}) {
  const needs = new Set<string>();
  if (installedPowerSystems > 0) needs.add("ecu-tuning");
  if (aspiration === "FORCED_INDUCTION" || installedCategories.has("forced-induction")) {
    needs.add("cooling");
    needs.add("fueling");
  }
  if (stage === "TUNED" || stage === "HIGH_OUTPUT") {
    needs.add("cooling");
    needs.add("brakes");
  }
  if (stage === "HIGH_OUTPUT") {
    needs.add("drivetrain");
    needs.add("wheels-tires");
  }
  if (drivetrain === "FWD" && (hpGainRatio ?? 0) >= 0.1) {
    needs.add("drivetrain");
    needs.add("wheels-tires");
  }
  if (drivetrain === "RWD" && stage === "HIGH_OUTPUT") {
    needs.add("brakes");
    needs.add("wheels-tires");
  }

  for (const installedCategory of installedCategories) needs.delete(installedCategory);
  return needs;
}

function classifyAspiration(vehicle: RecommendationVehicleProfile): Aspiration {
  const value = `${vehicle.forcedInduction || ""} ${vehicle.engine || ""}`;
  if (/\b(turbo(?:charg(?:ed|er))?|twin[- ]turbo|supercharg(?:ed|er)?|boost(?:ed)?|forced induction)\b/i.test(value)) return "FORCED_INDUCTION";
  if (/\b(naturally aspirated|n\/a|na engine)\b/i.test(value)) return "NATURALLY_ASPIRATED";
  if (vehicle.forcedInduction?.trim()) return "FORCED_INDUCTION";
  return "UNKNOWN";
}

function classifyDrivetrain(value?: string | null): DrivetrainLayout {
  if (!value) return "UNKNOWN";
  if (/\b(awd|4wd|4x4|all[- ]wheel)\b/i.test(value)) return "AWD";
  if (/\b(fwd|front[- ]wheel)\b/i.test(value)) return "FWD";
  if (/\b(rwd|rear[- ]wheel)\b/i.test(value)) return "RWD";
  return "UNKNOWN";
}
