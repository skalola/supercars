import { fetchNhtsaCarLineup } from "@/lib/maker-sites/sources/nhtsa";
import type { ModelLineupSource } from "../source";

export const nhtsaLineupSource: ModelLineupSource = {
  id: "nhtsa-vpic",
  async fetchCandidates({ makeName, startYear, endYear }) {
    const rows = await fetchNhtsaCarLineup(makeName, startYear, endYear);
    return rows.map((row) => ({
      sourceType: "NHTSA" as const,
      sourceName: "NHTSA vPIC",
      sourceUrl: row.sourceUrl,
      makeName,
      modelName: row.name,
      productionStartYear: row.productionStartYear,
      productionEndYear: row.productionEndYear,
      confidence: "MEDIUM" as const,
    }));
  },
};
