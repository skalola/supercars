import { z } from "zod";
import type { ApplicabilityCandidate } from "@/lib/parts/universal-applicability";

const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,100}$/);

export const partDiscoveryRequestSchema = z.object({
  systemSlug: slugSchema,
  year: z.number().int().min(1886).max(new Date().getFullYear() + 2).nullable().optional(),
}).strict();

export type PartDiscoveryRequest = z.infer<typeof partDiscoveryRequestSchema>;

export function canMaterializePartContext(candidate: ApplicabilityCandidate) {
  return candidate.status === "APPLICABLE" && candidate.publiclyApplicable;
}

export function isDisplayEligiblePartOffer(input: { fitmentConfidence: string; fitmentRisk: string }) {
  if (["EXACT_MATCH", "HIGH_CONFIDENCE", "HIGH"].includes(input.fitmentConfidence)) return true;
  return input.fitmentRisk === "LOW" && ["LIKELY_COMPATIBLE", "POSSIBLE_MATCH"].includes(input.fitmentConfidence);
}
