export const OEM_MAINTENANCE_HOSTS: Record<string, ReadonlySet<string>> = {
  acura: new Set(["owners.acura.com", "acura.com"]),
  honda: new Set(["mygarage.honda.com", "owners.honda.com", "honda.com"]),
  lexus: new Set(["drivers.lexus.com", "lexus.com"]),
  toyota: new Set(["toyota.com", "assets.sia.toyota.com"]),
  bmw: new Set(["bmwusa.com"]),
  "mercedes-benz": new Set(["mbusa.com"]),
  ferrari: new Set(["ferrari.com"]),
  lamborghini: new Set(["lamborghini.com"]),
  mclaren: new Set(["cars.mclaren.com", "mclaren.com"]),
  nissan: new Set(["nissanusa.com"]),
  ford: new Set(["ford.com"]),
  chevrolet: new Set(["chevrolet.com"]),
};
