type PartTrustCompatibility = {
  makeId: string | null;
  modelId: string | null;
};

export type PerformancePartTrustInput = {
  status: string;
  sourceUrl: string | null;
  sourceConfidence: string;
  imageUrl: string | null;
  retailPriceCents: number | null;
  estimatedHpGain: number | null;
  estimatedTorqueGain: number | null;
  compatibility: PartTrustCompatibility[];
};

export type PerformancePartTrustAudit = {
  publicEligible: boolean;
  readiness: "PUBLIC_READY" | "NEEDS_REVIEW";
  issues: string[];
  warnings: string[];
  score: number;
};

export function auditPerformancePartTrust(part: PerformancePartTrustInput): PerformancePartTrustAudit {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (part.status !== "ACTIVE") issues.push("Part is not active");
  if (!part.sourceUrl) issues.push("Missing original source URL");
  if (part.sourceConfidence !== "SOURCE_VERIFIED") issues.push("Source is not verified");
  if (!part.imageUrl) issues.push("Missing product image");
  if (part.compatibility.length === 0) issues.push("Missing make/model compatibility");

  const hasScopedFitment = part.compatibility.some((fitment) => fitment.makeId || fitment.modelId);
  if (part.compatibility.length > 0 && !hasScopedFitment) issues.push("Compatibility is unscoped");

  if (part.retailPriceCents === null) warnings.push("Missing retail price");
  if (part.estimatedHpGain === null && part.estimatedTorqueGain === null) warnings.push("Missing performance gain estimate");

  const score = Math.max(0, 100 - issues.length * 25 - warnings.length * 8);
  const publicEligible = issues.length === 0;

  return {
    publicEligible,
    readiness: publicEligible ? "PUBLIC_READY" : "NEEDS_REVIEW",
    issues,
    warnings,
    score,
  };
}
