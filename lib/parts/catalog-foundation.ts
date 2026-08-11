export type PartCategorySeed = {
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
};

export type PartBrandSeed = {
  name: string;
  slug: string;
  logoUrl?: string;
  websiteUrl?: string;
  country?: string;
};

export const PART_CATEGORY_SEEDS: PartCategorySeed[] = [
  {
    name: "Intake",
    slug: "intake",
    description: "Airboxes, filters, inlets, throttle bodies, and intake plumbing.",
    displayOrder: 10,
  },
  {
    name: "Exhaust",
    slug: "exhaust",
    description: "Mufflers, headers, downpipes, catalysts, valves, tips, and full exhaust systems.",
    displayOrder: 20,
  },
  {
    name: "ECU & Tuning",
    slug: "ecu-tuning",
    description: "ECU calibrations, piggybacks, transmission tunes, and engine management tools.",
    displayOrder: 30,
  },
  {
    name: "Forced Induction",
    slug: "forced-induction",
    description: "Turbocharger, supercharger, intercooler, and charge-air upgrades.",
    displayOrder: 40,
  },
  {
    name: "Fueling",
    slug: "fueling",
    description: "Injectors, pumps, rails, lines, flex-fuel, and fuel-system support parts.",
    displayOrder: 50,
  },
  {
    name: "Cooling",
    slug: "cooling",
    description: "Radiators, heat exchangers, oil coolers, tanks, fans, and coolant system upgrades.",
    displayOrder: 60,
  },
  {
    name: "Suspension",
    slug: "suspension",
    description: "Coilovers, springs, dampers, arms, bushings, links, and alignment hardware.",
    displayOrder: 70,
  },
  {
    name: "Brakes",
    slug: "brakes",
    description: "Pads, rotors, calipers, lines, fluid, and complete big-brake systems.",
    displayOrder: 80,
  },
  {
    name: "Wheels & Tires",
    slug: "wheels-tires",
    description: "Wheels, tires, spacers, studs, lug hardware, and track fitment support.",
    displayOrder: 90,
  },
  {
    name: "Aero & Body",
    slug: "aero-body",
    description: "Splitters, wings, diffusers, ducts, body kits, and carbon exterior parts.",
    displayOrder: 100,
  },
  {
    name: "Drivetrain",
    slug: "drivetrain",
    description: "Clutches, flywheels, axles, differentials, mounts, and transmission hardware.",
    displayOrder: 110,
  },
  {
    name: "Interior & Safety",
    slug: "interior-safety",
    description: "Seats, harnesses, steering wheels, cages, fire systems, and cockpit hardware.",
    displayOrder: 120,
  },
];

export const PART_BRAND_SEEDS: PartBrandSeed[] = [
  { name: "Akrapovic", slug: "akrapovic", websiteUrl: "https://www.akrapovic.com", country: "Slovenia" },
  { name: "AEM", slug: "aem", websiteUrl: "https://www.aemelectronics.com", country: "United States" },
  { name: "AMS Performance", slug: "ams-performance", websiteUrl: "https://www.amsperformance.com", country: "United States" },
  { name: "APR Performance", slug: "apr-performance", websiteUrl: "https://aprperformance.com", country: "United States" },
  { name: "BBS", slug: "bbs", websiteUrl: "https://bbs.com", country: "Germany" },
  { name: "Borla", slug: "borla", websiteUrl: "https://www.borla.com", country: "United States" },
  { name: "Brembo", slug: "brembo", websiteUrl: "https://www.brembo.com", country: "Italy" },
  { name: "COBB Tuning", slug: "cobb-tuning", websiteUrl: "https://www.cobbtuning.com", country: "United States" },
  { name: "CORSA Performance", slug: "corsa-performance", websiteUrl: "https://www.corsaperformance.com", country: "United States" },
  { name: "Capristo", slug: "capristo", websiteUrl: "https://www.capristo.de", country: "Germany" },
  { name: "Dinan", slug: "dinan", websiteUrl: "https://www.dinancars.com", country: "United States" },
  { name: "Eibach", slug: "eibach", websiteUrl: "https://eibach.com", country: "Germany" },
  { name: "Eventuri", slug: "eventuri", websiteUrl: "https://www.eventuri.net", country: "United Kingdom" },
  { name: "Fabspeed Motorsport", slug: "fabspeed", websiteUrl: "https://www.fabspeed.com", country: "United States" },
  { name: "GReddy", slug: "greddy", websiteUrl: "https://www.greddy.com", country: "Japan" },
  { name: "HKS", slug: "hks", websiteUrl: "https://www.hks-power.co.jp", country: "Japan" },
  { name: "Injen Technology", slug: "injen", websiteUrl: "https://injen.com", country: "United States" },
  { name: "K-Tuned", slug: "k-tuned", websiteUrl: "https://k-tuned.com", country: "Canada" },
  { name: "KW Suspensions", slug: "kw-suspensions", websiteUrl: "https://www.kwsuspensions.com", country: "Germany" },
  { name: "Mishimoto", slug: "mishimoto", websiteUrl: "https://www.mishimoto.com", country: "United States" },
  { name: "Motec", slug: "motec", websiteUrl: "https://www.motec.com.au", country: "Australia" },
  { name: "Novitec", slug: "novitec", websiteUrl: "https://www.novitecgroup.com", country: "Germany" },
  { name: "Ohlins", slug: "ohlins", websiteUrl: "https://www.ohlins.com", country: "Sweden" },
  { name: "Rays", slug: "rays", websiteUrl: "https://www.rayswheels.co.jp", country: "Japan" },
  { name: "Radium Engineering", slug: "radium-engineering", websiteUrl: "https://www.radiumauto.com", country: "United States" },
  { name: "Renntech", slug: "renntech", websiteUrl: "https://www.renntechmercedes.com", country: "United States" },
  { name: "Ryft", slug: "ryft", websiteUrl: "https://ryft.co", country: "United States" },
  { name: "Skunk2 Racing", slug: "skunk2", websiteUrl: "https://skunk2.com", country: "United States" },
  { name: "Sparco", slug: "sparco", websiteUrl: "https://www.sparco-official.com", country: "Italy" },
  { name: "ARMASPEED", slug: "armaspeed", websiteUrl: "https://www.armaspeed.com", country: "Taiwan" },
  { name: "Tein", slug: "tein", websiteUrl: "https://www.tein.com", country: "Japan" },
  { name: "Titan Motorsports", slug: "titan-motorsports", websiteUrl: "https://www.titanmotorsports.com", country: "United States" },
  { name: "Tomei", slug: "tomei", websiteUrl: "https://www.tomeiusa.com", country: "Japan" },
  { name: "Vorsteiner", slug: "vorsteiner", websiteUrl: "https://vorsteiner.com", country: "United States" },
];

export const AFFILIATE_PARTNER_SEEDS = [
  {
    name: "Scuderia Car Parts",
    slug: "scuderia-car-parts",
    network: "Direct",
    websiteUrl: "https://www.scuderiacarparts.com",
    status: "CANDIDATE",
    commissionLabel: "Pending application",
  },
  {
    name: "Summit Racing",
    slug: "summit-racing",
    network: "Affiliate Network",
    websiteUrl: "https://www.summitracing.com",
    status: "CANDIDATE",
    commissionLabel: "Pending application",
  },
  {
    name: "Tire Rack",
    slug: "tire-rack",
    network: "Affiliate Network",
    websiteUrl: "https://www.tirerack.com",
    status: "CANDIDATE",
    commissionLabel: "Pending application",
  },
  {
    name: "Vivid Racing",
    slug: "vivid-racing",
    network: "Direct/Ambassador",
    websiteUrl: "https://www.vividracing.com",
    status: "CANDIDATE",
    commissionLabel: "Pending application",
  },
];
