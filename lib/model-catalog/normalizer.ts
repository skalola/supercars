export function normalizeCatalogText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(lp|gt|gts|rs|r|s|sv|svj|amg|sti|type r)\b/g, " $1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreTitleMatch(title: string, makeName: string, modelName: string) {
  const normalizedTitle = normalizeCatalogText(title);
  const normalizedMake = normalizeCatalogText(makeName);
  const normalizedModel = normalizeCatalogText(modelName);

  if (!normalizedTitle || !normalizedModel) return 0;

  let score = 0;
  if (normalizedTitle.includes(normalizedModel)) score += 55;
  if (normalizedTitle.includes(normalizedMake)) score += 25;

  const modelTokens = normalizedModel.split(" ").filter((token) => token.length > 1);
  const matchingTokens = modelTokens.filter((token) => normalizedTitle.includes(token)).length;
  score += modelTokens.length ? Math.round((matchingTokens / modelTokens.length) * 20) : 0;

  if (/concept|race car|fictional|vision gran turismo/.test(normalizedTitle) && !/concept|vision gran turismo/.test(normalizedModel)) {
    score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

export function buildModelSearchQuery(makeName: string, modelName: string) {
  return `${makeName.trim()} ${modelName.trim()} car`;
}

export function isUsefulModelImageUrl(value: string | null | undefined) {
  if (!value) return false;
  return /^https?:\/\//i.test(value) && !/logo|badge|emblem|icon|svg/i.test(value);
}
