import { familyKey, normalizeLineupCandidate } from "./normalizer";
import type { CatalogIdentityDecision, ModelLineupCandidate } from "./types";

type ExistingIdentity = { id: string; name: string; slug: string; variants?: Array<{ id: string; name: string }> };

export function evaluateCatalogIdentity(candidateInput: ModelLineupCandidate, existing: ExistingIdentity[]): CatalogIdentityDecision {
  const candidate = normalizeLineupCandidate(candidateInput);
  const family = candidate.canonicalFamilyName || candidate.modelName;
  const key = familyKey(candidate.makeName, family);
  const exactModel = existing.find((item) => normalize(item.name) === normalize(family));
  if (exactModel) {
    if (candidate.variantName && normalize(candidate.variantName) !== normalize(exactModel.name)) {
      return decision("LINK_VARIANT", key, exactModel.name, candidate.confidence === "LOW" ? "NEEDS_REVIEW" : "SOURCE_VERIFIED", []);
    }
    return decision("LINK_MODEL", key, exactModel.name, candidate.confidence === "LOW" ? "NEEDS_REVIEW" : "SOURCE_VERIFIED", []);
  }

  if (!family || family.length < 2 || /^\d{4}$/.test(family)) {
    return decision("REJECT", key, family, "REJECTED", ["Candidate does not identify a usable model family."]);
  }

  if (candidate.sourceType === "OEM" && candidate.confidence === "SOURCE_VERIFIED") {
    return decision("CREATE_MODEL", key, family, "SOURCE_VERIFIED", ["Official manufacturer source identifies the model family."]);
  }

  if (candidate.sourceType === "EPA" && candidate.canonicalFamilyName && candidate.confidence !== "LOW") {
    return decision("CREATE_MODEL", key, family, "SOURCE_VERIFIED", ["Government source provides an explicit base-model family."]);
  }

  return decision("REVIEW", key, family, "NEEDS_REVIEW", [
    `${candidate.sourceName} is useful evidence but cannot create a family without corroboration.`,
  ]);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function decision(action: CatalogIdentityDecision["action"], normalizedFamilyKey: string, canonicalFamilyName: string, reviewStatus: CatalogIdentityDecision["reviewStatus"], reasons: string[]): CatalogIdentityDecision {
  return { action, normalizedFamilyKey, canonicalFamilyName, reviewStatus, reasons };
}
