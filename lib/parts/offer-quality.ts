import { normalizeOemPartNumber } from "@/lib/parts/ferrari-taxonomy";

export type OfferConfidence = "EXACT_MATCH" | "HIGH_CONFIDENCE" | "LIKELY_COMPATIBLE" | "POSSIBLE_MATCH" | "REJECTED";
export type PartFitmentRisk = "LOW" | "MEDIUM" | "HIGH";

export type OfferQualityInput = {
  makeName?: string;
  title: string;
  canonicalPartName: string;
  canonicalManufacturer?: string | null;
  oemPartNumber?: string | null;
  compatibleModels: string[];
  condition?: string | null;
  sellerFeedbackPercentage?: number | null;
  imageUrl?: string | null;
  priceCents?: number | null;
  marketplaceCompatibilityMatch?: string | null;
};

export type OfferQualityResult = {
  score: number;
  confidence: OfferConfidence;
  reasons: string[];
  oemMatchType: "EXACT" | "NONE";
  genuineOemStatus: "CLAIMED" | "NOT_STATED";
  compatibilityStatus: "MARKETPLACE_MATCH" | "MODEL_NAMED" | "UNKNOWN";
  sellerQualityScore: number | null;
};

export type ComponentOfferQualityInput = {
  makeName?: string;
  title: string;
  modelName: string;
  componentName: string;
  knownModels?: string[];
  knownFerrariModels?: string[];
  knownBrands: string[];
  year?: number | null;
  condition?: string | null;
  sellerFeedbackPercentage?: number | null;
  imageUrl?: string | null;
  priceCents?: number | null;
  marketplaceCompatibilityMatch?: string | null;
  compatibilityProperties?: Array<{ name?: string; value?: string }>;
  localizedAspects?: Array<{ name?: string; value?: string }>;
  categoryNames?: string[];
  aliases?: string[];
  fitmentRisk?: PartFitmentRisk;
  identifiers?: string[];
};

const REJECTED_TERMS = /\b(toy|diecast|die-cast|model car|poster|brochure|manual|catalog|magazine|book|keychain|sticker|decal|memorabilia|lego)\b/i;
const STOP_WORDS = new Set(["and", "for", "with", "the", "ferrari", "oem", "genuine", "part", "parts"]);

export function scoreOffer(input: OfferQualityInput): OfferQualityResult {
  const makeName = input.makeName?.trim() || "Ferrari";
  const normalizedTitle = normalizeSearchText(input.title);
  const reasons: string[] = [];
  const rejected = (reason: string): OfferQualityResult => ({
    score: -100,
    confidence: "REJECTED",
    reasons: [reason],
    oemMatchType: "NONE",
    genuineOemStatus: "NOT_STATED",
    compatibilityStatus: "UNKNOWN",
    sellerQualityScore: getSellerQualityScore(input.sellerFeedbackPercentage),
  });
  if (REJECTED_TERMS.test(input.title)) return rejected("Non-automotive collectible or reference item");
  const conflictingMake = findConflictingMake(input.title, makeName);
  if (conflictingMake) return rejected(`Different vehicle manufacturer: ${conflictingMake}`);

  let score = 0;
  const normalizedOem = input.oemPartNumber ? normalizeOemPartNumber(input.oemPartNumber) : "";
  const compactTitle = normalizeOemPartNumber(input.title);
  const exactOemMatch = Boolean(normalizedOem && compactTitle.includes(normalizedOem));
  if (exactOemMatch) {
    score += 60;
    reasons.push("Exact OEM part number");
  }
  if (normalizedTitle.includes(normalizeSearchText(makeName))) {
    score += 15;
    reasons.push(`${makeName} named`);
  }

  const manufacturerTokens = tokenize(input.canonicalManufacturer || "");
  const manufacturerMatch = manufacturerTokens.some((token) => normalizedTitle.includes(token));
  if (manufacturerMatch) {
    score += 15;
    reasons.push("Canonical manufacturer named");
  } else if (!normalizedOem && manufacturerTokens.length > 0) {
    score -= 25;
    reasons.push("Canonical manufacturer missing");
  }

  const matchingModel = input.compatibleModels.find((model) => {
    const modelTokens = tokenize(model);
    return modelTokens.length > 0 && modelTokens.every((token) => normalizedTitle.includes(token));
  });
  if (matchingModel) {
    score += 15;
    reasons.push(`Compatible model named: ${matchingModel}`);
  }
  if (input.marketplaceCompatibilityMatch) {
    score += 12;
    reasons.push("Marketplace compatibility signal");
  }

  const partTokens = tokenize(input.canonicalPartName);
  const matchingPartTokens = partTokens.filter((token) => normalizedTitle.includes(token));
  if (partTokens.length > 0) {
    const partNameScore = Math.round((matchingPartTokens.length / partTokens.length) * 20);
    score += partNameScore;
    if (partNameScore >= 10) reasons.push("Part description match");
  }

  if (/\b(new|new other|brand new)\b/i.test(input.condition || "")) {
    score += 5;
    reasons.push("New condition");
  }
  if ((input.sellerFeedbackPercentage ?? 0) >= 98) {
    score += 5;
    reasons.push("Strong seller feedback");
  }
  if (input.imageUrl) score += 3;
  if (input.priceCents != null && input.priceCents < 500) {
    score -= 15;
    reasons.push("Suspiciously low price");
  }

  const confidence: OfferConfidence = exactOemMatch
    ? "EXACT_MATCH"
    : score >= 70
      ? "HIGH_CONFIDENCE"
      : score >= 35
        ? "LIKELY_COMPATIBLE"
        : score >= 15
          ? "POSSIBLE_MATCH"
          : "REJECTED";
  return {
    score,
    confidence,
    reasons,
    oemMatchType: exactOemMatch ? "EXACT" : "NONE",
    genuineOemStatus: /\b(genuine|oem)\b/i.test(input.title) ? "CLAIMED" : "NOT_STATED",
    compatibilityStatus: input.marketplaceCompatibilityMatch
      ? "MARKETPLACE_MATCH"
      : matchingModel
        ? "MODEL_NAMED"
        : "UNKNOWN",
    sellerQualityScore: getSellerQualityScore(input.sellerFeedbackPercentage),
  };
}

export function scoreFerrariOffer(input: OfferQualityInput): OfferQualityResult {
  return scoreOffer({ ...input, makeName: input.makeName || "Ferrari" });
}

export function scoreComponentOffer(input: ComponentOfferQualityInput): OfferQualityResult {
  const makeName = input.makeName?.trim() || "Ferrari";
  const normalizedMake = normalizeSearchText(makeName);
  const knownModels = input.knownModels ?? input.knownFerrariModels ?? [];
  const rejected = (reason: string): OfferQualityResult => ({
    score: -100,
    confidence: "REJECTED",
    reasons: [reason],
    oemMatchType: "NONE",
    genuineOemStatus: "NOT_STATED",
    compatibilityStatus: "UNKNOWN",
    sellerQualityScore: getSellerQualityScore(input.sellerFeedbackPercentage),
  });
  if (REJECTED_TERMS.test(input.title)) return rejected("Non-automotive collectible or reference item");
  const conflictingMake = findConflictingMake(input.title, makeName);
  if (conflictingMake) return rejected(`Different vehicle manufacturer: ${conflictingMake}`);

  const title = normalizeSearchText(input.title);
  const structured = new Map((input.localizedAspects ?? [])
    .filter((aspect) => aspect.name && aspect.value)
    .map((aspect) => [normalizeSearchText(aspect.name ?? ""), normalizeSearchText(aspect.value ?? "")]));
  const compatibility = new Map((input.compatibilityProperties ?? [])
    .filter((property) => property.name && property.value)
    .map((property) => [normalizeSearchText(property.name ?? ""), normalizeSearchText(property.value ?? "")]));
  const structuredMake = structured.get("make") ?? compatibility.get("make") ?? "";
  if (structuredMake && structuredMake !== normalizedMake) return rejected(`Structured make conflicts: ${structuredMake}`);
  const selectedModelTokens = getDistinctiveModelTokens(input.modelName);
  const selectedModelMatch = selectedModelTokens.length > 0 && selectedModelTokens.every((token) => title.includes(token));
  const variantConflict = normalizedMake === "ferrari" ? getFerrariVariantConflict(input.modelName, title) : null;
  if (input.fitmentRisk === "HIGH" && variantConflict) return rejected(variantConflict);
  const conflictingModel = knownModels.find((model) => {
    if (model === input.modelName) return false;
    const tokens = getDistinctiveModelTokens(model);
    return tokens.length > 0 && tokens.every((token) => title.includes(token));
  });
  if (conflictingModel && !selectedModelMatch) return rejected(`Different ${makeName} model named: ${conflictingModel}`);

  const componentPhrases = [...new Set([input.componentName, ...(input.aliases ?? [])].map(normalizeSearchText).filter(Boolean))];
  const componentConflict = getPartTypeTitleConflict(input.componentName, title);
  if (componentConflict) return rejected(componentConflict);
  const componentTokenSets = componentPhrases.map(tokenize).filter((tokens) => tokens.length > 0);
  const bestComponentMatch = componentTokenSets.reduce((best, tokens) => {
    const matched = tokens.filter((token) => title.includes(toSingularToken(token)) || title.includes(token));
    const ratio = matched.length / tokens.length;
    return ratio > best.ratio ? { ratio, matched, tokens } : best;
  }, { ratio: 0, matched: [] as string[], tokens: [] as string[] });
  if (bestComponentMatch.matched.length === 0) return rejected("Component type or alias not present");

  const reasons: string[] = [];
  let score = 0;
  const normalizedIdentifiers = (input.identifiers ?? []).map(normalizeOemPartNumber).filter(Boolean);
  const compactTitle = normalizeOemPartNumber(input.title);
  const exactIdentifier = normalizedIdentifiers.find((identifier) => compactTitle.includes(identifier));
  if (exactIdentifier) {
    score += 70;
    reasons.push("Exact OEM or manufacturer part number");
  }
  if (containsPhrase(input.title, makeName)) {
    score += 20;
    reasons.push(`${makeName} named`);
  }
  if (selectedModelMatch) {
    score += 35;
    reasons.push(`Exact model named: ${input.modelName}`);
  }
  if (bestComponentMatch.tokens.length > 0) {
    const componentScore = Math.round(bestComponentMatch.ratio * 30);
    score += componentScore;
    if (componentScore >= 15) reasons.push("Component description match");
  }
  const knownBrand = input.knownBrands.find((brand) => title.includes(normalizeSearchText(brand)));
  if (knownBrand) {
    score += 10;
    reasons.push(`Known manufacturer named: ${knownBrand}`);
  }
  if (input.year && new RegExp(`\\b${input.year}\\b`).test(input.title)) {
    score += 8;
    reasons.push("Vehicle year named");
  }
  if (input.marketplaceCompatibilityMatch === "EXACT") {
    score += 30;
    reasons.push("eBay Motors exact compatibility match");
  } else if (input.marketplaceCompatibilityMatch === "POSSIBLE") {
    score += 14;
    reasons.push("eBay Motors possible compatibility match");
  }
  const structuredModel = structured.get("model") ?? compatibility.get("model") ?? "";
  if (structuredModel && selectedModelTokens.some((token) => structuredModel.includes(token))) {
    score += 18;
    reasons.push("Structured model match");
  }
  if (structuredMake === normalizedMake) {
    score += 10;
    reasons.push(`Structured ${makeName} make match`);
  }
  const automotiveCategory = (input.categoryNames ?? []).some((name) => /parts|automotive|car|truck|filter|brake|engine|exhaust|suspension|wheel|tire/i.test(name));
  if (automotiveCategory) {
    score += 7;
    reasons.push("Automotive parts category");
  }
  if (/\b(new|new other|brand new)\b/i.test(input.condition || "")) {
    score += 5;
    reasons.push("New condition");
  }
  if ((input.sellerFeedbackPercentage ?? 0) >= 98) {
    score += 5;
    reasons.push("Strong seller feedback");
  }
  if (input.imageUrl) score += 3;
  if (input.priceCents != null && input.priceCents < 500) {
    score -= 15;
    reasons.push("Suspiciously low price");
  }

  const risk = input.fitmentRisk ?? "MEDIUM";
  const highThreshold = risk === "HIGH" ? 85 : risk === "LOW" ? 55 : 65;
  const likelyThreshold = risk === "HIGH" ? 75 : risk === "LOW" ? 35 : 50;
  const possibleThreshold = risk === "HIGH" ? 60 : risk === "LOW" ? 25 : 40;
  const modelEvidence = selectedModelMatch
    || Boolean(structuredModel && selectedModelTokens.some((token) => structuredModel.includes(token)))
    || input.marketplaceCompatibilityMatch === "EXACT"
    || input.marketplaceCompatibilityMatch === "POSSIBLE";
  let confidence: OfferConfidence = exactIdentifier
    ? "EXACT_MATCH"
    : score >= highThreshold
      ? "HIGH_CONFIDENCE"
      : score >= likelyThreshold
        ? "LIKELY_COMPATIBLE"
        : score >= possibleThreshold
          ? "POSSIBLE_MATCH"
          : "REJECTED";
  if (risk === "MEDIUM" && !modelEvidence && confidence !== "REJECTED") confidence = "POSSIBLE_MATCH";
  if (risk === "HIGH" && !exactIdentifier && input.marketplaceCompatibilityMatch !== "EXACT" && !modelEvidence) confidence = "REJECTED";
  return {
    score,
    confidence,
    reasons,
    oemMatchType: exactIdentifier ? "EXACT" : "NONE",
    genuineOemStatus: /\b(genuine|oem)\b/i.test(input.title) ? "CLAIMED" : "NOT_STATED",
    compatibilityStatus: input.marketplaceCompatibilityMatch
      ? "MARKETPLACE_MATCH"
      : selectedModelMatch
        ? "MODEL_NAMED"
        : "UNKNOWN",
    sellerQualityScore: getSellerQualityScore(input.sellerFeedbackPercentage),
  };
}

export function scoreFerrariComponentOffer(input: ComponentOfferQualityInput): OfferQualityResult {
  return scoreComponentOffer({
    ...input,
    makeName: "Ferrari",
    knownModels: input.knownModels ?? input.knownFerrariModels ?? [],
  });
}

function getSellerQualityScore(feedback: number | null | undefined) {
  if (feedback == null || !Number.isFinite(feedback)) return null;
  return Math.max(0, Math.min(100, Math.round(feedback)));
}

function tokenize(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const KNOWN_VEHICLE_MAKES = [
  "Ferrari", "Lamborghini", "McLaren", "Porsche", "BMW", "Mercedes", "Mercedes-AMG", "Audi", "Maserati",
  "Chevrolet", "Ford", "Toyota", "Honda", "Acura", "Nissan", "Subaru", "Mitsubishi", "Mazda", "Dodge",
];

function findConflictingMake(title: string, selectedMake: string) {
  if (containsPhrase(title, selectedMake)) return null;
  return KNOWN_VEHICLE_MAKES.find((make) => normalizeSearchText(make) !== normalizeSearchText(selectedMake) && containsPhrase(title, make)) ?? null;
}

function containsPhrase(value: string, phrase: string) {
  const normalizedValue = ` ${normalizeSearchText(value)} `;
  const normalizedPhrase = normalizeSearchText(phrase);
  return Boolean(normalizedPhrase && normalizedValue.includes(` ${normalizedPhrase} `));
}

const GENERIC_MODEL_TOKENS = new Set(["ferrari", "italia", "stradale", "superfast", "berlinetta", "spider", "gtb", "gts", "gt", "gr"]);

function getDistinctiveModelTokens(value: string) {
  const tokens = normalizeSearchText(value).split(" ").filter((token) => token.length >= 2 && !GENERIC_MODEL_TOKENS.has(token));
  const coded = tokens.filter((token) => /\d/.test(token) || token.length >= 4);
  return coded.slice(0, 2);
}

const FERRARI_VARIANT_TOKENS = ["italia", "spider", "speciale", "challenge", "gtb", "gts", "tributo"];

function getFerrariVariantConflict(selectedModel: string, normalizedTitle: string) {
  const selected = FERRARI_VARIANT_TOKENS.filter((variant) => normalizeSearchText(selectedModel).split(" ").includes(variant));
  const named = FERRARI_VARIANT_TOKENS.filter((variant) => normalizedTitle.split(" ").includes(variant));
  if (selected.length === 0 || named.length === 0 || named.some((variant) => selected.includes(variant))) return null;
  return `Different Ferrari variant named: ${named.join(", ")}`;
}

function toSingularToken(value: string) {
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

export function getPartTypeTitleConflict(componentName: string, offerTitle: string) {
  const component = normalizeSearchText(componentName);
  const normalizedTitle = normalizeSearchText(offerTitle);
  if (component === "engine air filter" && !/\bair filter\b|\bair cleaner (element|filter)\b/.test(normalizedTitle)) {
    return "Offer does not identify an engine air-filter element";
  }
  if (component === "engine air filter" && /\b(covers?|trim|housings?|airbox|air box|lids?)\b/.test(normalizedTitle)) {
    return "Airbox cover or housing is not an engine air filter element";
  }
  if (component === "engine air filter" && /\b(universal|cone|clamp on|cold air intake filter kit|reusable high flow.*kit)\b/.test(normalizedTitle)) {
    return "Universal intake filter is not a vehicle-specific replacement filter";
  }
  if (component === "engine air filter" && /\b(fuel filter|oil filter|gas filter|inline filter|small engine|lawn mower)\b/.test(normalizedTitle)) {
    return "Fluid or small-engine filter is not an engine air-filter element";
  }
  if (component === "oil filter" && /\b(wrench|socket|housing|cap|cover|adapter)\b/.test(normalizedTitle)) {
    return "Oil-filter tool or housing is not an oil filter element";
  }
  if (component === "oil filter" && !/\boil filter\b/.test(normalizedTitle)) {
    return "Offer does not identify an oil-filter element";
  }
  if (component === "oil filter" && /\b(air filter|fuel filter|cabin filter|transmission filter)\b/.test(normalizedTitle)) {
    return "Different filter type";
  }
  if (/brake pads?/.test(component) && /\b(caliper cover|rotor only|disc only)\b/.test(normalizedTitle)) {
    return "Different brake component";
  }
  if (/brake pads?/.test(component) && !/\bbrake pads?\b|\bpad set\b/.test(normalizedTitle)) {
    return "Offer does not identify a brake-pad set";
  }
  if (component === "front brake pads" && /\brear\b/.test(normalizedTitle) && !/\bfront\b/.test(normalizedTitle)) {
    return "Rear-only brake pads do not match the selected front axle";
  }
  if (component === "rear brake pads" && /\bfront\b/.test(normalizedTitle) && !/\brear\b/.test(normalizedTitle)) {
    return "Front-only brake pads do not match the selected rear axle";
  }
  if (/brake rotors?/.test(component) && /\b(pads? only|caliper cover)\b/.test(normalizedTitle)) {
    return "Different brake component";
  }
  if (component === "performance exhaust" && /\b(universal|tips? only|valve controller|exhaust valve|catalytic converter|manifold gasket|hanger|bracket|u bend)\b/.test(normalizedTitle)) {
    return "Exhaust accessory is not a performance exhaust system";
  }
  if (component === "performance exhaust" && !/\bexhaust\b/.test(normalizedTitle)) {
    return "Offer does not identify an exhaust product";
  }
  if (component === "lowering spring" && !/\blowering springs?\b|\bsport springs?\b/.test(normalizedTitle)) {
    return "Offer does not identify a lowering-spring set";
  }
  return null;
}
