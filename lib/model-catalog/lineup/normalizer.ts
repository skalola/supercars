import type { ModelLineupCandidate } from "./types";

const MAKE_ALIASES = new Map([
  ["mercedes benz", "Mercedes-Benz"],
  ["mercedes-benz", "Mercedes-Benz"],
  ["mclaren automotive", "McLaren"],
  ["rolls royce", "Rolls-Royce"],
]);

export function normalizeCatalogText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().replace(/\s+/g, " ").toLowerCase();
}

export function canonicalMakeName(value: string) {
  const normalized = normalizeCatalogText(value);
  return MAKE_ALIASES.get(normalized) ?? value.trim().replace(/\s+/g, " ");
}

export function normalizeLineupCandidate(candidate: ModelLineupCandidate): ModelLineupCandidate {
  const modelName = candidate.modelName.trim().replace(/\s+/g, " ");
  const family = (candidate.canonicalFamilyName || modelName).trim().replace(/\s+/g, " ");
  return {
    ...candidate,
    makeName: canonicalMakeName(candidate.makeName),
    modelName,
    canonicalFamilyName: family,
    variantName: candidate.variantName?.trim().replace(/\s+/g, " ") || null,
  };
}

export function familyKey(makeName: string, familyName: string) {
  return `${normalizeCatalogText(canonicalMakeName(makeName))}:${normalizeCatalogText(familyName)}`;
}
