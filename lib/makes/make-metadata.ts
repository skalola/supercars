export type MakeRegion =
  | "Japan"
  | "Europe"
  | "United States"
  | "United Kingdom"
  | "Korea"
  | "China"
  | "Specialist / Tuner";

type MakeMetadata = {
  region: MakeRegion;
  logoSlug?: string;
};

const simpleIconSlugs: Record<string, string> = {
  afeela: "sony",
  amg: "mercedesamg",
  abarth: "abarth",
  acura: "acura",
  "alfa-romeo": "alfaromeo",
  alpine: "alpine",
  "aston-martin": "astonmartin",
  audi: "audi",
  bmw: "bmw",
  bugatti: "bugatti",
  chevrolet: "chevrolet",
  citroen: "citroen",
  dmc: "delorean",
  dodge: "dodge",
  fiat: "fiat",
  ferrari: "ferrari",
  ford: "ford",
  genesis: "genesis",
  honda: "honda",
  hyundai: "hyundai",
  infiniti: "infiniti",
  jaguar: "jaguar",
  jeep: "jeep",
  ktm: "ktm",
  lamborghini: "lamborghini",
  lancia: "lancia",
  lexus: "lexus",
  maserati: "maserati",
  mazda: "mazda",
  mclaren: "mclaren",
  "mercedes-benz": "mercedesbenz",
  mini: "mini",
  mitsubishi: "mitsubishi",
  nismo: "nissan",
  nissan: "nissan",
  opel: "opel",
  pagani: "pagani",
  peugeot: "peugeot",
  polestar: "polestar",
  pontiac: "pontiac",
  porsche: "porsche",
  renault: "renault",
  scion: "toyota",
  shelby: "shelbyamerican",
  skoda: "skoda",
  subaru: "subaru",
  suzuki: "suzuki",
  tesla: "tesla",
  toyota: "toyota",
  volkswagen: "volkswagen",
  volvo: "volvo",
  xiaomi: "xiaomi",
};

const regionBySlug: Record<string, MakeRegion> = {
  afeela: "Japan",
  amg: "Europe",
  abarth: "Europe",
  acura: "Japan",
  "alfa-romeo": "Europe",
  alpine: "Europe",
  amuse: "Specialist / Tuner",
  "aston-martin": "United Kingdom",
  audi: "Europe",
  autobianchi: "Europe",
  bac: "United Kingdom",
  bmw: "Europe",
  bvlgari: "Europe",
  bugatti: "Europe",
  chaparral: "United States",
  chevrolet: "United States",
  "chris-holstrom-concepts": "Specialist / Tuner",
  citroen: "Europe",
  dmc: "United States",
  "ds-automobiles": "Europe",
  daihatsu: "Japan",
  "de-tomaso": "Europe",
  dodge: "United States",
  "eckert-s-rod-and-custom": "Specialist / Tuner",
  fiat: "Europe",
  ferrari: "Europe",
  ford: "United States",
  "garage-rcr": "Specialist / Tuner",
  genesis: "Korea",
  "gran-turismo": "Japan",
  greddy: "Specialist / Tuner",
  "greening-auto-company": "Specialist / Tuner",
  honda: "Japan",
  hyundai: "Korea",
  infiniti: "Japan",
  italdesign: "Europe",
  jaguar: "United Kingdom",
  jeep: "United States",
  ktm: "Europe",
  lamborghini: "Europe",
  lancia: "Europe",
  lexus: "Japan",
  maserati: "Europe",
  mazda: "Japan",
  mclaren: "United Kingdom",
  "mercedes-benz": "Europe",
  mini: "United Kingdom",
  "mine-s": "Specialist / Tuner",
  mitsubishi: "Japan",
  nismo: "Japan",
  nissan: "Japan",
  opel: "Europe",
  pagani: "Europe",
  peugeot: "Europe",
  plymouth: "United States",
  polestar: "Europe",
  pontiac: "United States",
  porsche: "Europe",
  "re-amemiya": "Specialist / Tuner",
  radical: "United Kingdom",
  renault: "Europe",
  "roadster-shop": "Specialist / Tuner",
  ruf: "Europe",
  scion: "Japan",
  shelby: "United States",
  skoda: "Europe",
  subaru: "Japan",
  "super-formula": "Japan",
  suzuki: "Japan",
  tesla: "United States",
  toyota: "Japan",
  tvr: "United Kingdom",
  volkswagen: "Europe",
  volvo: "Europe",
  "wicked-fabrication": "Specialist / Tuner",
  xiaomi: "China",
  yangwang: "China",
  zagato: "Europe",
};

export function getMakeMetadata(slug: string): MakeMetadata {
  const normalizedSlug = normalizeMakeSlug(slug);
  return {
    region: regionBySlug[normalizedSlug] ?? "Specialist / Tuner",
    logoSlug: simpleIconSlugs[normalizedSlug],
  };
}

export function buildMakeLogoUrl(slug: string) {
  const logoSlug = getMakeMetadata(slug).logoSlug;
  return logoSlug ? `https://cdn.simpleicons.org/${logoSlug}/FFFFFF` : null;
}

export function normalizeMakeSlug(slug: string) {
  return slug
    .toLowerCase()
    .replace(/^citro-n$/, "citroen")
    .replace(/^koda$/, "skoda")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
