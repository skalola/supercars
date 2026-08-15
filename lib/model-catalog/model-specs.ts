export const CANONICAL_MODEL_SPEC_FIELDS = [
  "engine",
  "displacement",
  "cylinders",
  "horsepower",
  "torque",
  "transmission",
  "drivetrain",
  "weight",
] as const;

export type CanonicalModelSpecField = (typeof CANONICAL_MODEL_SPEC_FIELDS)[number];
export type CanonicalModelSpec = Record<CanonicalModelSpecField, string | null>;

export type VinDecodedSpec = {
  engine: string | null;
  displacement: string | null;
  engineCylinders: string | null;
  engineHP: string | null;
  transmission: string | null;
  drivetrain: string | null;
};

const VIN_FIELD_MAP = {
  engine: "engine",
  displacement: "displacement",
  cylinders: "engineCylinders",
  horsepower: "engineHP",
  transmission: "transmission",
  drivetrain: "drivetrain",
} as const satisfies Partial<Record<CanonicalModelSpecField, keyof VinDecodedSpec>>;

export function resolveVinDecodedModelSpec(vehicles: VinDecodedSpec[]) {
  const result: Partial<CanonicalModelSpec> = {};

  for (const [specField, vehicleField] of Object.entries(VIN_FIELD_MAP) as Array<
    [keyof typeof VIN_FIELD_MAP, (typeof VIN_FIELD_MAP)[keyof typeof VIN_FIELD_MAP]]
  >) {
    const consensus = selectConsensusValue(vehicles.map((vehicle) => vehicle[vehicleField]));
    if (consensus) result[specField] = consensus;
  }

  return result;
}

export function fillMissingModelSpec(
  current: Partial<CanonicalModelSpec> | null | undefined,
  sources: Array<Partial<CanonicalModelSpec>>,
) {
  const resolved = {} as CanonicalModelSpec;
  const filledFields: CanonicalModelSpecField[] = [];

  for (const field of CANONICAL_MODEL_SPEC_FIELDS) {
    const existing = clean(current?.[field]);
    const fallback = sources.map((source) => clean(source[field])).find(Boolean) ?? null;
    resolved[field] = existing ?? fallback;
    if (!existing && fallback) filledFields.push(field);
  }

  return { resolved, filledFields };
}

function selectConsensusValue(values: Array<string | null>) {
  const buckets = new Map<string, { value: string; count: number }>();
  for (const rawValue of values) {
    const value = clean(rawValue);
    if (!value) continue;
    const key = normalizeComparable(value);
    const current = buckets.get(key);
    buckets.set(key, { value: current?.value ?? value, count: (current?.count ?? 0) + 1 });
  }

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count || b.value.length - a.value.length);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].count === ranked[1].count) return null;
  return ranked[0].value;
}

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
}

function clean(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned || null;
}
