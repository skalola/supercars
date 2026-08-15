import {
  isBaseModelFallbackCompatible,
} from "@/lib/model-catalog/base-model";
import { normalizeCatalogText } from "@/lib/model-catalog/normalizer";

export type ModelImageIdentityStatus = "VERIFIED" | "REJECTED" | "REVIEW";

export type ModelImageIdentityInput = {
  makeName: string;
  modelName: string;
  siblingModelNames?: string[];
  image: {
    source?: string | null;
    sourceName?: string | null;
    sourceUrl?: string | null;
    attribution?: string | null;
    attributionUrl?: string | null;
    license?: string | null;
    confidence?: number | null;
  };
};

export type ModelImageIdentityResult = {
  status: ModelImageIdentityStatus;
  reason: string;
  exactModelEvidence: boolean;
};

export function evaluateModelImageIdentity(input: ModelImageIdentityInput): ModelImageIdentityResult {
  const source = input.image.source?.trim() || "";

  if (source === "BRAND_IMAGE_FALLBACK") {
    return review("Brand artwork is a safe placeholder, but it is not a verified model photograph.");
  }

  if (source === "BASE_MODEL_FALLBACK") {
    const sourceModelName = extractFallbackSourceModel(input.image.sourceName, input.makeName);
    if (!sourceModelName) return rejected("The fallback does not identify its source model.");

    return isBaseModelFallbackCompatible(input.modelName, sourceModelName, input.makeName)
      ? verified(`Fallback source belongs to the same ${input.makeName} model family.`)
      : rejected(`Fallback source ${input.makeName} ${sourceModelName} does not match ${input.makeName} ${input.modelName}.`);
  }

  const evidence = normalizeCatalogText([
    input.image.sourceName,
    input.image.sourceUrl,
    input.image.attribution,
    input.image.attributionUrl,
  ].filter(Boolean).join(" "));
  const targetModel = normalizeCatalogText(input.modelName);
  const exactModelEvidence = containsPhrase(evidence, targetModel);
  const conflictingSibling = findConflictingSibling(
    evidence,
    targetModel,
    input.siblingModelNames || [],
    input.modelName,
  );

  if (conflictingSibling && !exactModelEvidence) {
    return review(`Image evidence may identify ${input.makeName} ${conflictingSibling}; model aliases require review.`);
  }

  const confidence = input.image.confidence ?? 0;
  const trustedSource = /openverse|wikimedia|wikipedia|commons/i.test(source);
  const licensed = Boolean(input.image.license?.trim());
  const traceable = /^https?:\/\//i.test(input.image.sourceUrl || "");
  const photoContext = /\b(19|20)\d{2}\b|\b(my|car|vehicle|exterior|front|rear|side|profile|photo|photograph)\b/i.test(evidence);

  if (exactModelEvidence && trustedSource && licensed && traceable && confidence >= 70 && photoContext) {
    return verified("Exact model identity is supported by licensed, traceable photo metadata.");
  }

  return review("The available metadata does not prove exact model identity strongly enough for automatic approval.", exactModelEvidence);
}

function extractFallbackSourceModel(sourceName: string | null | undefined, makeName: string) {
  const match = sourceName?.match(/^Base model fallback from\s+(.+)$/i);
  if (!match?.[1]) return null;
  const label = match[1].trim();
  const makePrefix = `${makeName.trim()} `;
  return label.toLowerCase().startsWith(makePrefix.toLowerCase())
    ? label.slice(makePrefix.length).trim()
    : label;
}

function findConflictingSibling(
  evidence: string,
  targetModel: string,
  siblingModelNames: string[],
  currentModelName: string,
) {
  if (!evidence || containsPhrase(evidence, targetModel)) return null;

  return siblingModelNames
    .filter((name) => name !== currentModelName)
    .map((name) => ({ name, normalized: normalizeCatalogText(name) }))
    .filter((item) => item.normalized.length >= 2 && containsPhrase(evidence, item.normalized))
    .sort((first, second) => second.normalized.length - first.normalized.length)[0]?.name || null;
}

function containsPhrase(value: string, phrase: string) {
  if (!value || !phrase) return false;
  return ` ${value} `.includes(` ${phrase} `);
}

function verified(reason: string): ModelImageIdentityResult {
  return { status: "VERIFIED", reason, exactModelEvidence: true };
}

function rejected(reason: string): ModelImageIdentityResult {
  return { status: "REJECTED", reason, exactModelEvidence: false };
}

function review(reason: string, exactModelEvidence = false): ModelImageIdentityResult {
  return { status: "REVIEW", reason, exactModelEvidence };
}
