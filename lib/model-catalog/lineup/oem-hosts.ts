export const OFFICIAL_MODEL_CATALOG_HOSTS: Record<string, ReadonlySet<string>> = {
  acura: new Set(["acura.com"]),
  "alfa-romeo": new Set(["alfaromeousa.com", "alfaromeo.com"]),
  "aston-martin": new Set(["astonmartin.com"]),
  audi: new Set(["audiusa.com", "audi.com"]),
  bmw: new Set(["bmwusa.com", "bmw.com"]),
  bugatti: new Set(["bugatti.com"]),
  chevrolet: new Set(["chevrolet.com"]),
  dodge: new Set(["dodge.com"]),
  ferrari: new Set(["ferrari.com"]),
  ford: new Set(["ford.com"]),
  genesis: new Set(["genesis.com"]),
  honda: new Set(["honda.com"]),
  hyundai: new Set(["hyundaiusa.com", "hyundai.com"]),
  lamborghini: new Set(["lamborghini.com"]),
  lexus: new Set(["lexus.com"]),
  mazda: new Set(["mazdausa.com", "mazda.com"]),
  mclaren: new Set(["mclaren.com", "cars.mclaren.com"]),
  "mercedes-benz": new Set(["mbusa.com", "mercedes-benz.com"]),
  mitsubishi: new Set(["mitsubishicars.com", "mitsubishi-motors.com"]),
  nissan: new Set(["nissanusa.com", "nissan-global.com"]),
  porsche: new Set(["porsche.com"]),
  subaru: new Set(["subaru.com", "subaru-global.com"]),
  suzuki: new Set(["globalsuzuki.com", "suzuki.com"]),
  toyota: new Set(["toyota.com", "global.toyota"]),
  volkswagen: new Set(["vw.com", "volkswagen.com"]),
  volvo: new Set(["volvocars.com"]),
};

export function isApprovedOfficialCatalogUrl(makeSlug: string, sourceUrl: string) {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    return new URL(sourceUrl).protocol === "https:" && (OFFICIAL_MODEL_CATALOG_HOSTS[makeSlug]?.has(host) ?? false);
  } catch {
    return false;
  }
}
