import type { ModelLineupCandidate } from "./types";

export type ModelLineupSourceContext = {
  makeName: string;
  startYear: number;
  endYear: number;
};

export interface ModelLineupSource {
  id: string;
  fetchCandidates(context: ModelLineupSourceContext): Promise<ModelLineupCandidate[]>;
}
