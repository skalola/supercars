const GT7_CARLIST_URL = "https://www.gran-turismo.com/us/gt7/carlist/";
const GT7_ASSET_BASE_URL = "https://www.gran-turismo.com/common/dist/gt7/carlist/assets/";

type Gt7Car = {
  manufacturerId: string;
  nameLong: string;
  nameShort: string;
  driveTrain?: string;
  displacement?: string;
  power?: string;
  torque?: string;
  weight?: string;
};

type Gt7Manufacturer = {
  name: string;
};

export type Gt7ModelSpec = {
  makeName: string;
  modelName: string;
  sourceName: "Gran Turismo 7 official car list";
  sourceUrl: string;
  displacement: string | null;
  horsepower: string | null;
  torque: string | null;
  drivetrain: string | null;
  weight: string | null;
};

export async function fetchGt7ModelSpecs(): Promise<Gt7ModelSpec[]> {
  const appHtml = await fetchText(GT7_CARLIST_URL);
  const appAsset = requireMatch(appHtml, /src="\/common\/dist\/gt7\/carlist\/assets\/(index-[^"]+\.js)"/);
  const appSource = await fetchText(`${GT7_ASSET_BASE_URL}${appAsset}`);
  const carsAsset = requireMatch(appSource, /cars\.us\.ts":\(\)=>e\(\(\)=>import\("\.\/(cars\.us-[^"]+\.js)"/);
  const manufacturersAsset = requireMatch(appSource, /tuners\.us\.ts":\(\)=>e\(\(\)=>import\("\.\/(tuners\.us-[^"]+\.js)"/);
  const [{ Cars }, { Tuners }] = await Promise.all([
    importRemoteModule<{ Cars: Record<string, Gt7Car> }>(`${GT7_ASSET_BASE_URL}${carsAsset}`),
    importRemoteModule<{ Tuners: Record<string, Gt7Manufacturer> }>(`${GT7_ASSET_BASE_URL}${manufacturersAsset}`),
  ]);

  return Object.values(Cars).flatMap((car) => {
    const makeName = Tuners[car.manufacturerId]?.name?.trim();
    const modelName = normalizeGt7ModelName(car.nameShort || car.nameLong);
    if (!makeName || !modelName) return [];

    return [{
      makeName,
      modelName,
      sourceName: "Gran Turismo 7 official car list" as const,
      sourceUrl: GT7_CARLIST_URL,
      displacement: clean(car.displacement),
      horsepower: clean(car.power),
      torque: clean(car.torque),
      drivetrain: clean(car.driveTrain),
      weight: clean(car.weight),
    }];
  });
}

export function modelSpecMatchKey(makeName: string, modelName: string) {
  return `${normalize(makeName)}:${normalize(modelName)}`;
}

function normalizeGt7ModelName(value: string) {
  return value.replace(/\s*'(\d{2})$/g, "").replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bcoup[eé]\b/g, "coupe")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned || null;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SUPERCAR-DASH-model-catalog/1.0 (https://supercardash.com)" },
  });
  if (!response.ok) throw new Error(`GT7 source request failed with HTTP ${response.status}.`);
  return response.text();
}

function requireMatch(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  if (!match?.[1]) throw new Error("The GT7 model catalog asset could not be resolved.");
  return match[1];
}

async function importRemoteModule<T>(url: string): Promise<T> {
  const source = await fetchText(url);
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(dataUrl) as Promise<T>;
}
