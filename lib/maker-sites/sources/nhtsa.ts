const VPIC_BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles";

type VpicModelResult = {
  Make_Name?: string;
  Model_Name?: string;
};

type VpicResponse = {
  Results?: VpicModelResult[];
};

export type NhtsaModelLineupEntry = {
  name: string;
  productionStartYear: number;
  productionEndYear: number;
  sourceUrl: string;
};

export async function fetchNhtsaCarLineup(
  makeName: string,
  startYear: number,
  endYear: number,
): Promise<NhtsaModelLineupEntry[]> {
  const years = Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  const results = new Map<string, NhtsaModelLineupEntry>();

  for (let offset = 0; offset < years.length; offset += 4) {
    const batch = years.slice(offset, offset + 4);
    const responses = await Promise.all(batch.map((year) => fetchModelsForYear(makeName, year)));

    responses.forEach(({ year, sourceUrl, models }) => {
      models.forEach((name) => {
        const key = normalizeModelKey(name);
        const existing = results.get(key);
        if (existing) {
          existing.productionStartYear = Math.min(existing.productionStartYear, year);
          existing.productionEndYear = Math.max(existing.productionEndYear, year);
          return;
        }
        results.set(key, {
          name,
          productionStartYear: year,
          productionEndYear: year,
          sourceUrl,
        });
      });
    });
  }

  return [...results.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function fetchModelsForYear(makeName: string, year: number) {
  const sourceUrl = `${VPIC_BASE_URL}/GetModelsForMakeYear/make/${encodeURIComponent(makeName)}/modelyear/${year}/vehicletype/car?format=json`;
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "SUPERCAR-DASH-maker-catalog/1.0 (https://supercardash.com)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`NHTSA vPIC returned HTTP ${response.status} for ${makeName} ${year}.`);

  const payload = (await response.json()) as VpicResponse;
  const models = [...new Set(
    (payload.Results || [])
      .map((result) => result.Model_Name?.trim())
      .filter((name): name is string => Boolean(name)),
  )];
  return { year, sourceUrl, models };
}

function normalizeModelKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
