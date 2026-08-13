/**
 * lib/market-sources/model-matcher.ts
 *
 * Sprint 5.5 — Model Matching Helper
 *
 * Resolves incoming (make, model, year) strings from external sources
 * to existing Prisma Model records. Does NOT create new models.
 *
 * Matching strategy (in order):
 *   1. Exact slug match on model name
 *   2. Model name contained within the incoming string (case-insensitive)
 *   3. Incoming string contains the model name (handles "Huracan EVO" → "Huracan")
 *
 * Future improvements:
 *   - Levenshtein distance for typo tolerance
 *   - Make-specific alias tables
 *   - LLM-assisted disambiguation for ambiguous names
 */

import { prisma } from "@/lib/prisma";

export type ModelMatchResult =
  | { matched: true; modelId: string; modelName: string }
  | { matched: false; reason: string };

type MakeCatalog = {
  name: string;
  models: Array<{ id: string; name: string; slug: string }>;
};

const makeCatalogCache = new Map<string, Promise<MakeCatalog | null>>();

function getMakeCatalog(make: string) {
  const key = make.trim().toLowerCase();
  const cached = makeCatalogCache.get(key);
  if (cached) return cached;

  const catalog = prisma.make.findFirst({
    where: { name: { equals: make.trim() } },
    select: {
      name: true,
      models: {
        select: { id: true, name: true, slug: true },
      },
    },
  });
  makeCatalogCache.set(key, catalog);
  return catalog;
}

/**
 * Attempts to resolve a (make, model) string pair to a single Model record.
 *
 * @param make  Raw make string from external source, e.g. "Ferrari"
 * @param model Raw model string from external source, e.g. "458 Italia"
 * @returns ModelMatchResult — matched with modelId, or unmatched with reason
 */
export async function resolveModel(
  make: string,
  model: string
): Promise<ModelMatchResult> {
  const normalizedModel = model.trim().toLowerCase();

  // Fetch all models for this make (case-insensitive make slug match)
  const makeRecord = await getMakeCatalog(make);

  if (!makeRecord) {
    return {
      matched: false,
      reason: `Make not found: "${make}"`,
    };
  }

  if (makeRecord.models.length === 0) {
    return {
      matched: false,
      reason: `No models found for make: "${make}"`,
    };
  }

  // ── Pass 1: Exact slug match ──────────────────────────────────────────────
  const slugified = normalizedModel.replace(/\s+/g, "-");
  const exactSlug = makeRecord.models.find((m) => m.slug === slugified);
  if (exactSlug) {
    return { matched: true, modelId: exactSlug.id, modelName: exactSlug.name };
  }

  // ── Pass 2: Exact name match (case-insensitive) ───────────────────────────
  const exactName = makeRecord.models.find(
    (m) => m.name.toLowerCase() === normalizedModel
  );
  if (exactName) {
    return { matched: true, modelId: exactName.id, modelName: exactName.name };
  }

  // ── Pass 3: Incoming string contains model name ───────────────────────────
  // e.g. "Huracan EVO Spyder" contains "Huracan"
  const containedIn = makeRecord.models.find((m) =>
    normalizedModel.includes(m.name.toLowerCase())
  );
  if (containedIn) {
    return {
      matched: true,
      modelId: containedIn.id,
      modelName: containedIn.name,
    };
  }

  // ── Pass 4: Model name contains incoming string ───────────────────────────
  // e.g. DB model "458 Italia" contains incoming "458"
  const modelContains = makeRecord.models.find((m) =>
    m.name.toLowerCase().includes(normalizedModel)
  );
  if (modelContains) {
    return {
      matched: true,
      modelId: modelContains.id,
      modelName: modelContains.name,
    };
  }

  // ── Pass 5: Word-level overlap ────────────────────────────────────────────
  // Score each model by how many words from the incoming string it shares
  const incomingWords = normalizedModel.split(/\s+/).filter((w) => w.length > 1);
  let bestScore = 0;
  let bestModel: (typeof makeRecord.models)[number] | null = null;

  for (const m of makeRecord.models) {
    const modelWords = m.name.toLowerCase().split(/\s+/);
    const overlap = incomingWords.filter((w) => modelWords.includes(w)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestModel = m;
    }
  }

  if (bestScore > 0 && bestModel) {
    return {
      matched: true,
      modelId: bestModel.id,
      modelName: bestModel.name,
    };
  }

  return {
    matched: false,
    reason: `No model match for "${make} ${model}" (tried ${makeRecord.models.length} candidates)`,
  };
}

/**
 * Batch version: resolves an array of (make, model) pairs.
 * Returns a Map keyed by "make::model" for O(1) lookup during ingestion.
 */
export async function batchResolveModels(
  pairs: Array<{ make: string; model: string }>
): Promise<Map<string, ModelMatchResult>> {
  // Deduplicate
  const unique = new Map<string, { make: string; model: string }>();
  for (const p of pairs) {
    unique.set(`${p.make}::${p.model}`, p);
  }

  const results = new Map<string, ModelMatchResult>();

  await Promise.all(Array.from(unique.entries()).map(async ([key, { make, model }]) => {
    results.set(key, await resolveModel(make, model));
  }));

  return results;
}
