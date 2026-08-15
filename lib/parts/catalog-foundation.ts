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
  { name: "Maintenance & Service", slug: "maintenance-service", description: "Routine service parts, fluids, filters, plugs, belts, batteries, and service kits.", displayOrder: 10 },
  { name: "Engine", slug: "engine", description: "Internal engine, lubrication, ignition, sealing, mounting, and engine-bay components.", displayOrder: 20 },
  { name: "Air Induction", slug: "air-induction", description: "Intake, filtration, throttle, charge-air, turbocharger, and supercharger components.", displayOrder: 30 },
  { name: "Fuel System", slug: "fuel-system", description: "Fuel delivery, injection, regulation, filtration, and fuel-system support components.", displayOrder: 40 },
  { name: "Cooling", slug: "cooling", description: "Radiators, heat exchangers, oil coolers, tanks, fans, hoses, and thermostats.", displayOrder: 50 },
  { name: "Exhaust & Emissions", slug: "exhaust-emissions", description: "Manifolds, catalysts, pipes, mufflers, valves, sensors, and complete exhaust systems.", displayOrder: 60 },
  { name: "ECU & Electronics", slug: "ecu-electronics", description: "ECU calibration, controls, sensors, modules, diagnostics, and vehicle electronics.", displayOrder: 70 },
  { name: "Transmission & Drivetrain", slug: "transmission-drivetrain", description: "Transmissions, clutches, differentials, axles, driveshafts, mounts, and related service parts.", displayOrder: 80 },
  { name: "Suspension & Steering", slug: "suspension-steering", description: "Dampers, springs, arms, bushings, links, alignment, and steering components.", displayOrder: 90 },
  { name: "Brakes", slug: "brakes", description: "Pads, rotors, calipers, lines, fluid, cooling, and complete brake systems.", displayOrder: 100 },
  { name: "Wheels & Tires", slug: "wheels-tires", description: "Wheels, tires, spacers, studs, lug hardware, TPMS, and fitment support.", displayOrder: 110 },
  { name: "Body & Exterior", slug: "body-exterior", description: "Body panels, trim, glass, grilles, covers, and exterior replacement components.", displayOrder: 120 },
  { name: "Aerodynamics", slug: "aerodynamics", description: "Splitters, wings, diffusers, ducts, undertrays, and functional aerodynamic components.", displayOrder: 130 },
  { name: "Interior", slug: "interior", description: "Seats, controls, trim, restraints, safety equipment, and cockpit components.", displayOrder: 140 },
  { name: "Lighting", slug: "lighting", description: "Headlamps, tail lamps, indicators, bulbs, modules, and lighting controls.", displayOrder: 150 },
  { name: "Accessories & Care", slug: "accessories-care", description: "Protection, storage, detailing, charging, tools, and vehicle-care accessories.", displayOrder: 160 },
  { name: "Performance Packages", slug: "performance-packages", description: "Curated multi-system packages whose fitment and supporting requirements must be verified together.", displayOrder: 170 },
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
