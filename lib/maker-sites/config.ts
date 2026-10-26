export type MakerSiteConfig = {
  slug: string;
  hostname: string;
  displayName: string;
  flagshipModelSlug: string;
  accent: string;
  enabled: boolean;
};

export const MAKER_SITE_CONFIGS = [
  { slug: "acura", hostname: "acura.supercardash.com", displayName: "Acura", flagshipModelSlug: "nsx", accent: "#e72b2b", enabled: true },
  { slug: "alfa-romeo", hostname: "alfaromeo.supercardash.com", displayName: "Alfa Romeo", flagshipModelSlug: "giulia-gtam", accent: "#981e32", enabled: true },
  { slug: "aston-martin", hostname: "astonmartin.supercardash.com", displayName: "Aston Martin", flagshipModelSlug: "valkyrie", accent: "#00665e", enabled: true },
  { slug: "audi", hostname: "audi.supercardash.com", displayName: "Audi", flagshipModelSlug: "r8-coup-v10-plus", accent: "#bb0a30", enabled: true },
  { slug: "bmw", hostname: "bmw.supercardash.com", displayName: "BMW", flagshipModelSlug: "m-hybrid-v8", accent: "#1c69d4", enabled: true },
  { slug: "bugatti", hostname: "bugatti.supercardash.com", displayName: "Bugatti", flagshipModelSlug: "chiron", accent: "#164194", enabled: true },
  { slug: "chevrolet", hostname: "chevrolet.supercardash.com", displayName: "Chevrolet", flagshipModelSlug: "corvette-c8", accent: "#e6b93f", enabled: true },
  { slug: "dodge", hostname: "dodge.supercardash.com", displayName: "Dodge", flagshipModelSlug: "challenger-srt-demon", accent: "#d71920", enabled: true },
  { slug: "ferrari", hostname: "ferrari.supercardash.com", displayName: "Ferrari", flagshipModelSlug: "f80", accent: "#ef1b24", enabled: true },
  { slug: "ford", hostname: "ford.supercardash.com", displayName: "Ford", flagshipModelSlug: "ford-gt", accent: "#2d72d9", enabled: true },
  { slug: "genesis", hostname: "genesis.supercardash.com", displayName: "Genesis", flagshipModelSlug: "genesis-x-gran-berlinetta-vgt-concept", accent: "#9f8054", enabled: true },
  { slug: "honda", hostname: "honda.supercardash.com", displayName: "Honda", flagshipModelSlug: "nsx", accent: "#e40521", enabled: true },
  { slug: "hyundai", hostname: "hyundai.supercardash.com", displayName: "Hyundai", flagshipModelSlug: "hyundai-n-2025-vgt", accent: "#00aad2", enabled: true },
  { slug: "lamborghini", hostname: "lamborghini.supercardash.com", displayName: "Lamborghini", flagshipModelSlug: "revuelto", accent: "#d8ae3d", enabled: true },
  { slug: "lexus", hostname: "lexus.supercardash.com", displayName: "Lexus", flagshipModelSlug: "lfa", accent: "#d6d7d9", enabled: true },
  { slug: "mazda", hostname: "mazda.supercardash.com", displayName: "Mazda", flagshipModelSlug: "rx-vision", accent: "#910a2d", enabled: true },
  { slug: "mclaren", hostname: "mclaren.supercardash.com", displayName: "McLaren", flagshipModelSlug: "w1", accent: "#ff7900", enabled: true },
  { slug: "mercedes-benz", hostname: "mercedes-benz.supercardash.com", displayName: "Mercedes-Benz", flagshipModelSlug: "slr-mclaren", accent: "#b9c0c7", enabled: true },
  { slug: "mitsubishi", hostname: "mitsubishi.supercardash.com", displayName: "Mitsubishi", flagshipModelSlug: "lancer-evolution-final", accent: "#e60012", enabled: true },
  { slug: "nissan", hostname: "nissan.supercardash.com", displayName: "Nissan", flagshipModelSlug: "gt-r-nismo", accent: "#c3002f", enabled: true },
  { slug: "porsche", hostname: "porsche.supercardash.com", displayName: "Porsche", flagshipModelSlug: "918-spyder", accent: "#d5001c", enabled: true },
  { slug: "subaru", hostname: "subaru.supercardash.com", displayName: "Subaru", flagshipModelSlug: "wrx-sti-type-s", accent: "#0064b1", enabled: true },
  { slug: "suzuki", hostname: "suzuki.supercardash.com", displayName: "Suzuki", flagshipModelSlug: "v6-escudo-pikes-peak-special", accent: "#e20a17", enabled: true },
  { slug: "toyota", hostname: "toyota.supercardash.com", displayName: "Toyota", flagshipModelSlug: "gr-supra-rz", accent: "#eb0a1e", enabled: true },
  { slug: "volkswagen", hostname: "volkswagen.supercardash.com", displayName: "Volkswagen", flagshipModelSlug: "id-r", accent: "#00b0f0", enabled: true },
  { slug: "volvo", hostname: "volvo.supercardash.com", displayName: "Volvo", flagshipModelSlug: "v40-t5-r-design", accent: "#1c6bba", enabled: true },
] as const satisfies readonly MakerSiteConfig[];

export function getMakerSiteConfig(slug: string) {
  return MAKER_SITE_CONFIGS.find((site) => site.slug === slug) ?? null;
}

export function getMakerSlugFromHostname(hostname: string) {
  const normalized = hostname.toLowerCase().split(":")[0];
  if (normalized === "mercedes.supercardash.com" || normalized === "mercedes.localhost") {
    return "mercedes-benz";
  }
  const production = MAKER_SITE_CONFIGS.find((site) => site.enabled && site.hostname === normalized);
  if (production) return production.slug;

  if (normalized.endsWith(".localhost")) {
    const localHostname = normalized.slice(0, -".localhost".length);
    const localSite = MAKER_SITE_CONFIGS.find(
      (site) => site.hostname.split(".")[0] === localHostname,
    );
    return localSite?.enabled ? localSite.slug : null;
  }

  return null;
}
