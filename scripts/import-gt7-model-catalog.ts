import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GT7_CARLIST_URL = "https://www.gran-turismo.com/us/gt7/carlist/";
const GT7_ASSET_BASE_URL = "https://www.gran-turismo.com/common/dist/gt7/carlist/assets/";

type Gt7Car = {
  id: string;
  manufacturerId: string;
  nameLong: string;
  nameShort: string;
  carClass?: string;
  driveTrain?: string;
  displacement?: string;
  power?: string;
  torque?: string;
  weight?: string;
};

type Gt7Tuner = {
  id: string;
  name: string;
};

type CatalogRow = {
  make: string;
  model: string;
  year: number | null;
  category: string;
  source: string;
  spec?: {
    displacement?: string;
    horsepower?: string;
    torque?: string;
    drivetrain?: string;
    weight?: string;
  };
};

async function main() {
  const officialRows = await fetchGt7CatalogRows();
  const supplementalRows = tunerSupplementalRows();
  const rows = dedupeRows([...officialRows, ...supplementalRows]);

  let makesUpserted = 0;
  let modelsUpserted = 0;

  for (const row of rows) {
    const make = await prisma.make.upsert({
      where: { slug: slugify(row.make) },
      update: { name: row.make },
      create: { name: row.make, slug: slugify(row.make) },
    });
    makesUpserted += 1;

    const model = await prisma.model.upsert({
      where: { makeId_slug: { makeId: make.id, slug: slugify(row.model) } },
      update: {
        name: row.model,
        years: row.year ? String(row.year) : undefined,
        productionStartYear: row.year,
        productionEndYear: row.year,
        category: row.category,
        description: `${row.source} catalog seed for market intelligence, trackers, garage, and future inventory matching.`,
      },
      create: {
        makeId: make.id,
        name: row.model,
        slug: slugify(row.model),
        years: row.year ? String(row.year) : null,
        productionStartYear: row.year,
        productionEndYear: row.year,
        category: row.category,
        description: `${row.source} catalog seed for market intelligence, trackers, garage, and future inventory matching.`,
      },
    });
    modelsUpserted += 1;

    if (row.spec) {
      await prisma.modelSpec.upsert({
        where: { modelId: model.id },
        update: {
          displacement: row.spec.displacement ?? null,
          horsepower: row.spec.horsepower ?? null,
          torque: row.spec.torque ?? null,
          drivetrain: row.spec.drivetrain ?? null,
          weight: row.spec.weight ?? null,
        },
        create: {
          modelId: model.id,
          displacement: row.spec.displacement ?? null,
          horsepower: row.spec.horsepower ?? null,
          torque: row.spec.torque ?? null,
          drivetrain: row.spec.drivetrain ?? null,
          weight: row.spec.weight ?? null,
        },
      });
    }
  }

  console.log(
    `[import-gt7-model-catalog] Upserted ${modelsUpserted} model rows across ${new Set(rows.map((row) => row.make)).size} makes. Make upserts attempted: ${makesUpserted}.`,
  );
  console.log(`[import-gt7-model-catalog] Official GT7 rows: ${officialRows.length}; supplemental tuner rows: ${supplementalRows.length}.`);
}

async function fetchGt7CatalogRows(): Promise<CatalogRow[]> {
  const appHtml = await fetchText(GT7_CARLIST_URL);
  const appAssetMatch = appHtml.match(/src="\/common\/dist\/gt7\/carlist\/assets\/(index-[^"]+\.js)"/);
  if (!appAssetMatch) {
    throw new Error("Unable to locate the Gran Turismo 7 car-list app asset.");
  }

  const appAsset = await fetchText(`${GT7_ASSET_BASE_URL}${appAssetMatch[1]}`);
  const carsAsset = requireAsset(appAsset, /cars\.us\.ts":\(\)=>e\(\(\)=>import\("\.\/(cars\.us-[^"]+\.js)"/);
  const tunersAsset = requireAsset(appAsset, /tuners\.us\.ts":\(\)=>e\(\(\)=>import\("\.\/(tuners\.us-[^"]+\.js)"/);

  const [{ Cars }, { Tuners }] = await Promise.all([
    importRemoteModule<{ Cars: Record<string, Gt7Car> }>(`${GT7_ASSET_BASE_URL}${carsAsset}`),
    importRemoteModule<{ Tuners: Record<string, Gt7Tuner> }>(`${GT7_ASSET_BASE_URL}${tunersAsset}`),
  ]);

  return Object.values(Cars).map((car) => {
    const make = Tuners[car.manufacturerId]?.name || "Unknown";
    return {
      make,
      model: normalizeGt7ModelName(car.nameShort || car.nameLong),
      year: parseModelYear(car.nameLong || car.nameShort),
      category: ["GT7", car.carClass].filter(Boolean).join(" / "),
      source: "Gran Turismo 7 official car list",
      spec: {
        displacement: car.displacement,
        horsepower: car.power,
        torque: car.torque,
        drivetrain: car.driveTrain,
        weight: car.weight,
      },
    };
  });
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

function requireAsset(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Unable to resolve GT7 asset with ${pattern}`);
  return match[1];
}

async function importRemoteModule<T>(url: string): Promise<T> {
  const source = await fetchText(url);
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(dataUrl) as Promise<T>;
}

function normalizeGt7ModelName(name: string) {
  return name
    .replace(/\s*'(\d{2})$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseModelYear(name: string) {
  const match = name.match(/'(\d{2})\s*$/);
  if (!match) return null;
  const twoDigitYear = Number(match[1]);
  return twoDigitYear > 30 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
}

function dedupeRows(rows: CatalogRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${slugify(row.make)}:${slugify(row.model)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tunerSupplementalRows(): CatalogRow[] {
  const rows: Array<[string, string, number | null]> = [
    ["Acura", "Integra Type R", 2001],
    ["Acura", "NSX", 1997],
    ["Acura", "RSX Type-S", 2006],
    ["Acura", "TL Type-S", 2008],
    ["Honda", "Civic Si", 2008],
    ["Honda", "Civic Type R", 2023],
    ["Honda", "CRX Si", 1991],
    ["Honda", "Prelude Type SH", 2001],
    ["Honda", "S2000", 2009],
    ["Toyota", "Chaser Tourer V", 1998],
    ["Toyota", "MR2 Turbo", 1995],
    ["Toyota", "Soarer 2.5GT-T", 1996],
    ["Toyota", "Supra Turbo", 1998],
    ["Toyota", "GR Corolla", 2024],
    ["Nissan", "240SX", 1998],
    ["Nissan", "300ZX Twin Turbo", 1996],
    ["Nissan", "Silvia S13", 1991],
    ["Nissan", "Silvia S14", 1998],
    ["Nissan", "Silvia S15", 2002],
    ["Nissan", "Skyline GT-R", 1999],
    ["Mazda", "Mazdaspeed3", 2013],
    ["Mazda", "Miata", 1997],
    ["Mazda", "RX-7", 1995],
    ["Mazda", "RX-8", 2011],
    ["Mitsubishi", "3000GT VR-4", 1999],
    ["Mitsubishi", "Eclipse GSX", 1999],
    ["Mitsubishi", "Lancer Evolution IX", 2006],
    ["Subaru", "BRZ tS", 2024],
    ["Subaru", "Impreza WRX STI", 2007],
    ["Lexus", "IS 300", 2005],
    ["Lexus", "LFA", 2012],
    ["Volkswagen", "Golf R", 2024],
    ["Volkswagen", "GTI", 2024],
  ];

  return rows.map(([make, model, year]) => ({
    make,
    model,
    year,
    category: "Tuner favorite",
    source: "SUPERCAR DASH tuner curation",
  }));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

main()
  .catch((error) => {
    console.error("[import-gt7-model-catalog] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
