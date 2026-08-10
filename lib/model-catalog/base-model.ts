export function canonicalBaseModelName(value: string, makeName?: string) {
  const makeTokens = makeName
    ? makeName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean)
    : [];
  const withoutParens = value.replace(/\([^)]*\)/g, " ");
  const normalized = withoutParens
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(
      /\b(gr\.?\s?[134b]|group\s?[134b]|vgt|vision gran turismo|safety car|pace car|race car|racing car|rally car|drift car|road car|concept|prototype|touring car|coupe|coup|coupé|sedan|saloon|roadster|convertible|cabriolet|spyder|spider|hatchback|wagon|estate)\b/g,
      " ",
    )
    .replace(/\b(gt500|gt300|gt3|gt4|gte|gtr|gt-r|lm|super gt|dtm|pikes peak|endurance model|sprint model)\b/g, " ")
    .replace(/\b(type\s?[rs]|v[\s-]?spec|spec|edition|final|limited|premium|performance|sport|sports|allure|line|rs|rz|sz|gsr|mr|evo|evolution)\b/g, " ")
    .replace(/\b(mark|mk)\s?[ivx]+\b/g, " ")
    .replace(/\b[0-9]{4}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized
    .split(" ")
    .filter((token) => !makeTokens.includes(token))
    .join(" ");
}

export function scoreBaseModelFallback(targetBase: string, sourceBase: string) {
  if (!targetBase || !sourceBase) return 0;
  const targetTokens = targetBase.split(" ").filter(Boolean);
  const sourceTokens = sourceBase.split(" ").filter(Boolean);
  if (sourceTokens.length === 0 || targetTokens.length === 0) return 0;

  const targetDistinctiveTokens = targetTokens.filter((token) => !isGenericModelToken(token));
  const sourceDistinctiveTokens = sourceTokens.filter((token) => !isGenericModelToken(token));
  const sharedDistinctiveTokens = sourceDistinctiveTokens.filter((token) => targetDistinctiveTokens.includes(token));
  if (sharedDistinctiveTokens.length === 0) return 0;
  if (targetBase === sourceBase) return 96;

  const sourcePhrase = ` ${sourceBase} `;
  const targetPhrase = ` ${targetBase} `;
  if (targetPhrase.includes(sourcePhrase) && sourceBase.length >= 4) return 90;
  if (sourcePhrase.includes(targetPhrase) && targetBase.length >= 2 && sourceDistinctiveTokens.length <= targetDistinctiveTokens.length + 2) return 88;

  const sharedTokens = sourceTokens.filter((token) => targetTokens.includes(token));
  const sharedRatio = sharedTokens.length / Math.max(sourceTokens.length, targetTokens.length);
  return sharedTokens.length >= 2 && sharedRatio >= 0.5 ? Math.round(80 + sharedRatio * 10) : 0;
}

export function isGenericModelToken(token: string) {
  return [
    "srt",
    "amg",
    "m",
    "r",
    "s",
    "rs",
    "sv",
    "svj",
    "gt",
    "gts",
    "gtr",
    "sti",
    "wrx",
    "type",
    "sport",
    "sports",
    "turbo",
    "hybrid",
    "coupe",
    "sedan",
    "roadster",
    "spyder",
  ].includes(token);
}
