import { createHash } from "node:crypto";
import type { ModelLineupSource } from "../source";
import type { ModelLineupCandidate } from "../types";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";
const USER_AGENT = "SupercarDashCatalog/1.0 (https://supercardash.com; support@supercardash.com)";
const MAKER_ENTITY_OVERRIDES: Record<string, string> = {
  "aston martin": "Q27074",
  audi: "Q23317",
  bugatti: "Q27401",
  ford: "Q44294",
  genesis: "Q21451523",
  hyundai: "Q55931",
  mclaren: "Q1351854",
  mitsubishi: "Q36033",
  nissan: "Q20165",
  suzuki: "Q181642",
  volvo: "Q215293",
};

type EntitySearchResponse = {
  search?: Array<{ id: string; label?: string; description?: string }>;
};

type SparqlResponse = {
  results?: {
    bindings?: Array<{
      model?: { value?: string };
      modelLabel?: { value?: string };
      modelDescription?: { value?: string };
      start?: { value?: string };
      end?: { value?: string };
    }>;
  };
};

type HeritageFamily = {
  externalId: string;
  sourceLabel: string;
  canonicalName: string;
  description: string;
  startYear: number | null;
  endYear: number | null;
};

export const wikidataHeritageLineupSource: ModelLineupSource = {
  id: "wikidata-heritage",
  async fetchCandidates({ makeName }) {
    const maker = await resolveMakerEntity(makeName);
    if (!maker) throw new Error(`Wikidata maker entity could not be resolved for ${makeName}.`);

    const families = await fetchHeritageFamilies(maker.id, makeName);
    return families.map((family) => ({
      sourceType: "WIKIDATA" as const,
      sourceName: "Wikidata",
      sourceUrl: `https://www.wikidata.org/wiki/${family.externalId}`,
      externalId: family.externalId,
      makeName,
      modelName: family.sourceLabel,
      canonicalFamilyName: family.canonicalName,
      productionStartYear: family.startYear,
      productionEndYear: family.endYear,
      confidence: "HIGH" as const,
      payloadHash: createHash("sha256")
        .update(JSON.stringify(family))
        .digest("hex"),
    } satisfies ModelLineupCandidate));
  },
};

export function canonicalWikidataFamilyName(label: string, makeName: string) {
  const makePattern = makeName
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join("[\\s-]+");
  return label
    .replace(new RegExp(`^${makePattern}[\\s:-]+`, "i"), "")
    .replace(/\s*\([^)]*(?:generation|model years?|north america|europe|japan|china|australia|\b19\d{2}\b|\b20\d{2}\b)[^)]*\)\s*/gi, " ")
    .replace(/\s+(?:(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth)\s+generation)\s*$/i, "")
    .replace(/\s+(?:type\s+[rs](?:\s+[a-z0-9-]+)?|hybrid|gx)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRoadModelCandidate(label: string, description: string, makeName: string) {
  const canonical = canonicalWikidataFamilyName(label, makeName);
  const combined = `${label} ${description}`.toLowerCase();
  if (!canonical || /^q\d+$/i.test(label) || canonical.length < 2) return false;
  if (!normalizeWords(label).startsWith(`${normalizeWords(makeName)} `)) return false;
  if (/\b(concept|prototype|racing car|race car|formula one|video game|motorcycle|engine|transmission|gearbox|tractor)\b/.test(combined)) return false;
  return /\b(car|automobile|vehicle|roadster|coupe|coupé|sedan|saloon|hatchback|wagon|estate|suv|pickup|van|minivan|sports car|supercar|grand tourer)\b/.test(combined);
}

async function resolveMakerEntity(makeName: string) {
  const override = MAKER_ENTITY_OVERRIDES[normalizeWords(makeName)];
  if (override) return { id: override };
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: makeName,
    language: "en",
    uselang: "en",
    type: "item",
    limit: "10",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`${WIKIDATA_API}?${params.toString()}`, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`Wikidata maker lookup failed with HTTP ${response.status}.`);
  const data = (await response.json()) as EntitySearchResponse;
  const normalizedMake = normalize(makeName);
  return (data.search || []).find((item) => {
    const labelMatches = normalize(item.label || "") === normalizedMake;
    const description = String(item.description || "").toLowerCase();
    return labelMatches && /automobile|automotive|automaker|car manufacturer|luxury vehicle|motor company/.test(description);
  }) || null;
}

async function fetchHeritageFamilies(makerId: string, makeName: string) {
  const query = `
    SELECT DISTINCT ?model ?modelLabel ?modelDescription ?start ?end WHERE {
      VALUES ?maker { wd:${makerId} }
      ?model (wdt:P1716|wdt:P176) ?maker;
             wdt:P31/wdt:P279* wd:Q3231690.
      OPTIONAL { ?model (wdt:P571|wdt:P5204) ?start. }
      OPTIONAL { ?model wdt:P576 ?end. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY ?modelLabel
    LIMIT 1000
  `;
  const params = new URLSearchParams({ query, format: "json" });
  const response = await fetch(`${WIKIDATA_SPARQL}?${params.toString()}`, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`Wikidata lineup query failed with HTTP ${response.status}.`);
  const data = (await response.json()) as SparqlResponse;
  const grouped = new Map<string, HeritageFamily>();

  for (const row of data.results?.bindings || []) {
    const entityUrl = row.model?.value || "";
    const externalId = entityUrl.match(/\/entity\/(Q\d+)$/)?.[1] || "";
    const sourceLabel = row.modelLabel?.value?.trim() || "";
    const description = row.modelDescription?.value?.trim() || "";
    if (!externalId || !isRoadModelCandidate(sourceLabel, description, makeName)) continue;
    const canonicalName = canonicalWikidataFamilyName(sourceLabel, makeName);
    const key = normalize(canonicalName);
    const startYear = yearFromDate(row.start?.value);
    const endYear = yearFromDate(row.end?.value);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { externalId, sourceLabel, canonicalName, description, startYear, endYear });
      continue;
    }
    current.startYear = minYear(current.startYear, startYear);
    current.endYear = maxYear(current.endYear, endYear);
    if (sourceLabel.length < current.sourceLabel.length) {
      current.externalId = externalId;
      current.sourceLabel = sourceLabel;
      current.description = description;
    }
  }

  return [...grouped.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

function requestHeaders() {
  return {
    Accept: "application/sparql-results+json, application/json",
    "Accept-Encoding": "gzip, deflate",
    "User-Agent": USER_AGENT,
  };
}

function yearFromDate(value?: string) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year >= 1800 && year <= new Date().getUTCFullYear() + 2 ? year : null;
}

function minYear(left: number | null, right: number | null) {
  if (left == null) return right;
  if (right == null) return left;
  return Math.min(left, right);
}

function maxYear(left: number | null, right: number | null) {
  if (left == null) return right;
  if (right == null) return left;
  return Math.max(left, right);
}

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeWords(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
