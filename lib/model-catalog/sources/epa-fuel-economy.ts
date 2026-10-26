import { Readable } from "node:stream";
import { parse } from "csv-parse";

export const EPA_VEHICLE_DATA_URL = "https://www.fueleconomy.gov/feg/epadata/vehicles.csv";
export const EPA_SOURCE_NAME = "U.S. EPA FuelEconomy.gov";

export type EpaVehicleRecord = {
  sourceId: string;
  sourceUrl: string;
  year: number;
  make: string;
  model: string;
  baseModel: string;
  cylinders: number | null;
  displacementLiters: number | null;
  drivetrain: string | null;
  transmission: string | null;
  engineDescription: string | null;
  aspiration: "NATURALLY_ASPIRATED" | "TURBOCHARGED" | "SUPERCHARGED" | "TWIN_CHARGED" | "ELECTRIC" | "HYBRID" | "UNKNOWN";
  fuelType: string | null;
  vehicleClass: string | null;
};

type EpaCsvRow = Record<string, string | undefined>;

export async function fetchEpaVehicleRecords(acceptedMakes: ReadonlySet<string>) {
  const response = await fetch(EPA_VEHICLE_DATA_URL, {
    headers: { "User-Agent": "SUPERCAR-DASH-model-catalog/1.0 (https://supercardash.com)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`EPA FuelEconomy.gov returned HTTP ${response.status}.`);
  }

  const records: EpaVehicleRecord[] = [];
  const parser = Readable.fromWeb(response.body as never).pipe(parse({
    columns: true,
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }));

  for await (const raw of parser) {
    const row = raw as EpaCsvRow;
    const make = clean(row.make);
    if (!make || !acceptedMakes.has(normalizeMakeName(make))) continue;
    const model = clean(row.model);
    const year = parseInteger(row.year);
    const sourceId = clean(row.id);
    if (!model || !year || !sourceId) continue;

    const fuelType = clean(row.fuelType1) || clean(row.fuelType);
    records.push({
      sourceId,
      sourceUrl: `https://www.fueleconomy.gov/feg/Find.do?action=sbs&id=${encodeURIComponent(sourceId)}`,
      year,
      make,
      model,
      baseModel: clean(row.baseModel) || model,
      cylinders: parseInteger(row.cylinders),
      displacementLiters: parseNumber(row.displ),
      drivetrain: clean(row.drive),
      transmission: clean(row.trany),
      engineDescription: clean(row.eng_dscr),
      aspiration: classifyAspiration(row.tCharger, row.sCharger, fuelType),
      fuelType,
      vehicleClass: clean(row.VClass),
    });
  }

  return records;
}

export function normalizeMakeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalEpaMakeName(makeName: string) {
  const aliases: Record<string, string> = {
    mclaren: "McLaren Automotive",
    "mercedes benz": "Mercedes-Benz",
  };
  return aliases[normalizeMakeName(makeName)] || makeName;
}

function classifyAspiration(turbo: string | undefined, supercharger: string | undefined, fuelType: string | null): EpaVehicleRecord["aspiration"] {
  if (/electricity/i.test(fuelType || "") && !/gasoline|diesel/i.test(fuelType || "")) return "ELECTRIC";
  if (/electricity/i.test(fuelType || "")) return "HYBRID";
  const hasTurbo = clean(turbo) !== null;
  const hasSupercharger = clean(supercharger) !== null;
  if (hasTurbo && hasSupercharger) return "TWIN_CHARGED";
  if (hasTurbo) return "TURBOCHARGED";
  if (hasSupercharger) return "SUPERCHARGED";
  return "NATURALLY_ASPIRATED";
}

function parseInteger(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNumber(value: string | undefined) {
  const parsed = Number.parseFloat(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}
