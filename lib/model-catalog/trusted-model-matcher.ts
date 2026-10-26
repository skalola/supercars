export type MatchableModel = { id: string; name: string; slug: string };

export function findTrustedModelMatch(sourceName: string, makeName: string, models: MatchableModel[]) {
  const sourceIdentity = trustedModelIdentity(sourceName, makeName);
  if (!sourceIdentity) return null;
  const matches = models.filter((model) => trustedModelIdentity(model.name, makeName) === sourceIdentity);
  if (matches.length === 0) return null;
  const model = [...matches].sort((a, b) => {
    const aSuffix = /-\d+$/.test(a.slug) ? 1 : 0;
    const bSuffix = /-\d+$/.test(b.slug) ? 1 : 0;
    return aSuffix - bSuffix || a.slug.length - b.slug.length || a.slug.localeCompare(b.slug);
  })[0];
  return { model, score: 100 };
}

export function trustedModelIdentity(value: string, makeName: string) {
  const make = normalizeWords(makeName);
  const normalized = normalizeWords(value);
  const withoutMake = normalized === make
    ? normalized
    : normalized.startsWith(`${make} `)
      ? normalized.slice(make.length + 1)
      : normalized;
  return withoutMake
    .replace(/\b([a-z])\s+(\d)/g, "$1$2")
    .replace(/\b(\d)\s+([a-z])\b/g, "$1$2")
    .replace(/\s+/g, "")
    .trim();
}

export function slugifyTrustedModel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeWords(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
