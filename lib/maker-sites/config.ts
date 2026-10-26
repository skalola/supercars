export type MakerSiteConfig = {
  slug: string;
  hostname: string;
  displayName: string;
  flagshipModelSlug: string;
  accent: string;
  enabled: boolean;
};

export const MAKER_SITE_CONFIGS = [
  { slug: "acura", hostname: "acura.supercardash.com", displayName: "Acura", flagshipModelSlug: "nsx", accent: "#e72b2b", enabled: false },
  { slug: "bmw", hostname: "bmw.supercardash.com", displayName: "BMW", flagshipModelSlug: "m4", accent: "#1c69d4", enabled: false },
  { slug: "chevrolet", hostname: "chevrolet.supercardash.com", displayName: "Chevrolet", flagshipModelSlug: "corvette-zr1-c6", accent: "#e6b93f", enabled: false },
  { slug: "ferrari", hostname: "ferrari.supercardash.com", displayName: "Ferrari", flagshipModelSlug: "f80", accent: "#ef1b24", enabled: false },
  { slug: "ford", hostname: "ford.supercardash.com", displayName: "Ford", flagshipModelSlug: "ford-gt", accent: "#2d72d9", enabled: false },
  { slug: "honda", hostname: "honda.supercardash.com", displayName: "Honda", flagshipModelSlug: "nsx", accent: "#e40521", enabled: true },
  { slug: "lamborghini", hostname: "lamborghini.supercardash.com", displayName: "Lamborghini", flagshipModelSlug: "revuelto", accent: "#d8ae3d", enabled: false },
  { slug: "lexus", hostname: "lexus.supercardash.com", displayName: "Lexus", flagshipModelSlug: "lfa", accent: "#d6d7d9", enabled: false },
  { slug: "mclaren", hostname: "mclaren.supercardash.com", displayName: "McLaren", flagshipModelSlug: "w1", accent: "#ff7900", enabled: false },
  { slug: "mercedes-benz", hostname: "mercedes.supercardash.com", displayName: "Mercedes-Benz", flagshipModelSlug: "amg-gt-black-series", accent: "#b9c0c7", enabled: false },
  { slug: "nissan", hostname: "nissan.supercardash.com", displayName: "Nissan", flagshipModelSlug: "gt-r-nismo", accent: "#c3002f", enabled: false },
  { slug: "toyota", hostname: "toyota.supercardash.com", displayName: "Toyota", flagshipModelSlug: "gr-supra-rz", accent: "#eb0a1e", enabled: false },
] as const satisfies readonly MakerSiteConfig[];

export function getMakerSiteConfig(slug: string) {
  return MAKER_SITE_CONFIGS.find((site) => site.slug === slug) ?? null;
}

export function getMakerSlugFromHostname(hostname: string) {
  const normalized = hostname.toLowerCase().split(":")[0];
  const production = MAKER_SITE_CONFIGS.find((site) => site.enabled && site.hostname === normalized);
  if (production) return production.slug;

  if (normalized.endsWith(".localhost")) {
    const localSlug = normalized.slice(0, -".localhost".length);
    const localSite = getMakerSiteConfig(localSlug);
    return localSite?.enabled ? localSite.slug : null;
  }

  return null;
}
