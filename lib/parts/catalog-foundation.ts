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
  { name: "A'PEXi", slug: "apexi", websiteUrl: "https://www.apexi-usa.com", country: "Japan" },
  { name: "AMS Performance", slug: "ams-performance", websiteUrl: "https://www.amsperformance.com", country: "United States" },
  { name: "APR Performance", slug: "apr-performance", websiteUrl: "https://aprperformance.com", country: "United States" },
  { name: "Advan", slug: "advan", websiteUrl: "https://www.y-yokohama.com", country: "Japan" },
  { name: "ARC", slug: "arc", country: "Japan" },
  { name: "BBS", slug: "bbs", websiteUrl: "https://bbs.com", country: "Germany" },
  { name: "Blitz", slug: "blitz", websiteUrl: "https://www.blitz.co.jp", country: "Japan" },
  { name: "Borla", slug: "borla", websiteUrl: "https://www.borla.com", country: "United States" },
  { name: "Bride", slug: "bride", websiteUrl: "https://bride-jp.com", country: "Japan" },
  { name: "Brembo", slug: "brembo", websiteUrl: "https://www.brembo.com", country: "Italy" },
  { name: "COBB Tuning", slug: "cobb-tuning", websiteUrl: "https://www.cobbtuning.com", country: "United States" },
  { name: "CORSA Performance", slug: "corsa-performance", websiteUrl: "https://www.corsaperformance.com", country: "United States" },
  { name: "Capristo", slug: "capristo", websiteUrl: "https://www.capristo.de", country: "Germany" },
  { name: "Cusco", slug: "cusco", websiteUrl: "https://www.cusco.co.jp", country: "Japan" },
  { name: "Defi", slug: "defi", websiteUrl: "https://www.nippon-seiki.co.jp/defi", country: "Japan" },
  { name: "Dinan", slug: "dinan", websiteUrl: "https://www.dinancars.com", country: "United States" },
  { name: "Eibach", slug: "eibach", websiteUrl: "https://eibach.com", country: "Germany" },
  { name: "Endless", slug: "endless", websiteUrl: "https://www.endless-sport.co.jp", country: "Japan" },
  { name: "Eventuri", slug: "eventuri", websiteUrl: "https://www.eventuri.net", country: "United Kingdom" },
  { name: "Fabspeed Motorsport", slug: "fabspeed", websiteUrl: "https://www.fabspeed.com", country: "United States" },
  { name: "Fujitsubo", slug: "fujitsubo", websiteUrl: "https://www.fujitsubo.co.jp", country: "Japan" },
  { name: "GReddy", slug: "greddy", websiteUrl: "https://www.greddy.com", country: "Japan" },
  { name: "HKS", slug: "hks", websiteUrl: "https://www.hks-power.co.jp", country: "Japan" },
  { name: "Hondata", slug: "hondata", websiteUrl: "https://www.hondata.com", country: "United States" },
  { name: "Injen Technology", slug: "injen", websiteUrl: "https://injen.com", country: "United States" },
  { name: "J's Racing", slug: "js-racing", websiteUrl: "https://www.jsracing.co.jp", country: "Japan" },
  { name: "Jun Auto", slug: "jun-auto", websiteUrl: "https://www.junauto.co.jp", country: "Japan" },
  { name: "K-Tuned", slug: "k-tuned", websiteUrl: "https://k-tuned.com", country: "Canada" },
  { name: "KW Suspensions", slug: "kw-suspensions", websiteUrl: "https://www.kwsuspensions.com", country: "Germany" },
  { name: "Mishimoto", slug: "mishimoto", websiteUrl: "https://www.mishimoto.com", country: "United States" },
  { name: "Motec", slug: "motec", websiteUrl: "https://www.motec.com.au", country: "Australia" },
  { name: "Mugen", slug: "mugen", websiteUrl: "https://www.mugen-power.com", country: "Japan" },
  { name: "NISMO", slug: "nismo", websiteUrl: "https://www.nismo.co.jp", country: "Japan" },
  { name: "Novitec", slug: "novitec", websiteUrl: "https://www.novitecgroup.com", country: "Germany" },
  { name: "Ohlins", slug: "ohlins", websiteUrl: "https://www.ohlins.com", country: "Sweden" },
  { name: "OS Giken", slug: "os-giken", websiteUrl: "https://osgiken.co.jp", country: "Japan" },
  { name: "Project Mu", slug: "project-mu", websiteUrl: "https://www.project-mu.co.jp", country: "Japan" },
  { name: "Rays", slug: "rays", websiteUrl: "https://www.rayswheels.co.jp", country: "Japan" },
  { name: "Radium Engineering", slug: "radium-engineering", websiteUrl: "https://www.radiumauto.com", country: "United States" },
  { name: "Renntech", slug: "renntech", websiteUrl: "https://www.renntechmercedes.com", country: "United States" },
  { name: "Ryft", slug: "ryft", websiteUrl: "https://ryft.co", country: "United States" },
  { name: "Skunk2 Racing", slug: "skunk2", websiteUrl: "https://skunk2.com", country: "United States" },
  { name: "Spoon Sports", slug: "spoon-sports", websiteUrl: "https://www.spoonsports.jp", country: "Japan" },
  { name: "Sparco", slug: "sparco", websiteUrl: "https://www.sparco-official.com", country: "Italy" },
  { name: "ARMASPEED", slug: "armaspeed", websiteUrl: "https://www.armaspeed.com", country: "Taiwan" },
  { name: "Tanabe", slug: "tanabe", websiteUrl: "https://www.rd-tanabe.com", country: "Japan" },
  { name: "Tein", slug: "tein", websiteUrl: "https://www.tein.com", country: "Japan" },
  { name: "Titan Motorsports", slug: "titan-motorsports", websiteUrl: "https://www.titanmotorsports.com", country: "United States" },
  { name: "Toda Racing", slug: "toda-racing", websiteUrl: "https://www.toda-racing.co.jp", country: "Japan" },
  { name: "Tomei", slug: "tomei", websiteUrl: "https://www.tomeiusa.com", country: "Japan" },
  { name: "Trust", slug: "trust", websiteUrl: "https://www.trust-power.com", country: "Japan" },
  { name: "Volk Racing", slug: "volk-racing", websiteUrl: "https://www.rayswheels.co.jp", country: "Japan" },
  { name: "Vorsteiner", slug: "vorsteiner", websiteUrl: "https://vorsteiner.com", country: "United States" },
  { name: "Work Wheels", slug: "work-wheels", websiteUrl: "https://www.work-wheels.co.jp", country: "Japan" },
  { name: "Yokohama", slug: "yokohama", websiteUrl: "https://www.y-yokohama.com", country: "Japan" },
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
