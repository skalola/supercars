import type { ModelEditorOption } from "@/lib/makes/catalog";

export async function fetchCatalogModels(
  makeIds: string[],
  signal?: AbortSignal,
): Promise<ModelEditorOption[]> {
  if (makeIds.length === 0) return [];

  const params = new URLSearchParams();
  for (const makeId of Array.from(new Set(makeIds)).sort()) {
    params.append("makeId", makeId);
  }

  const response = await fetch(`/api/catalog/models?${params.toString()}`, { signal });
  if (!response.ok) throw new Error("Unable to load models.");

  const payload = await response.json() as { models?: ModelEditorOption[] };
  return Array.isArray(payload.models) ? payload.models : [];
}
