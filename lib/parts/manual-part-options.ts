import { PART_BRAND_SEEDS } from "@/lib/parts/catalog-foundation";

export type ManualPartTypeGroup = {
  categoryId: string;
  categorySlug: string;
  options: string[];
};

export const ADDITIONAL_JDM_PART_BRANDS = [
  "A'PEXi",
  "Advan",
  "ARC",
  "Blitz",
  "Bride",
  "Cusco",
  "Defi",
  "Endless",
  "Fujitsubo",
  "Hondata",
  "J's Racing",
  "Jun Auto",
  "Mugen",
  "NISMO",
  "OS Giken",
  "Project Mu",
  "Spoon Sports",
  "Tanabe",
  "Toda Racing",
  "Trust",
  "Volk Racing",
  "Work Wheels",
  "Yokohama",
] as const;

export const COMMON_PART_TYPES_BY_CATEGORY_SLUG: Record<string, string[]> = {
  intake: [
    "Cold Air Intake",
    "Short Ram Intake",
    "High-Flow Air Filter",
    "Carbon Fiber Intake System",
    "Intake Manifold",
    "Throttle Body",
    "Velocity Stack",
    "Turbo Inlet Pipe",
  ],
  exhaust: [
    "Cat-Back Exhaust",
    "Axle-Back Exhaust",
    "Valved Exhaust",
    "Headers",
    "Downpipe",
    "Mid Pipe",
    "High-Flow Catalytic Converter",
    "Exhaust Tips",
  ],
  "ecu-tuning": [
    "ECU Tune",
    "Flash Tune",
    "Piggyback Tuner",
    "Standalone ECU",
    "Boost Controller",
    "Fuel Controller",
    "Dyno Tune",
    "Transmission Tune",
  ],
  "forced-induction": [
    "Turbocharger Kit",
    "Supercharger Kit",
    "Intercooler",
    "Blow-Off Valve",
    "Wastegate",
    "Charge Pipe",
    "Turbo Blanket",
    "Compressor Wheel",
  ],
  fueling: [
    "Fuel Pump",
    "Fuel Injectors",
    "Fuel Rail",
    "Fuel Pressure Regulator",
    "Flex Fuel Kit",
    "Fuel Lines",
    "Surge Tank",
  ],
  cooling: [
    "Radiator",
    "Oil Cooler",
    "Heat Exchanger",
    "Intercooler",
    "Coolant Hose Kit",
    "Expansion Tank",
    "Radiator Fan",
  ],
  suspension: [
    "Coilovers",
    "Lowering Springs",
    "Sway Bars",
    "Strut Bar",
    "Control Arms",
    "Camber Kit",
    "Bushings",
    "Air Suspension Kit",
  ],
  brakes: [
    "Big Brake Kit",
    "Brake Pads",
    "Brake Rotors",
    "Brake Calipers",
    "Stainless Brake Lines",
    "Brake Fluid",
    "Brake Cooling Ducts",
  ],
  "wheels-tires": [
    "Forged Wheels",
    "Flow Formed Wheels",
    "Performance Tires",
    "Track Tires",
    "Wheel Spacers",
    "Lug Nuts",
    "Wheel Studs",
  ],
  "aero-body": [
    "Front Lip",
    "Splitter",
    "Side Skirts",
    "Rear Diffuser",
    "Rear Wing",
    "Canards",
    "Carbon Fiber Hood",
    "Widebody Kit",
  ],
  drivetrain: [
    "Clutch Kit",
    "Flywheel",
    "Limited Slip Differential",
    "Short Shifter",
    "Driveshaft",
    "Axles",
    "Transmission Mount",
    "Engine Mount",
  ],
  "interior-safety": [
    "Bucket Seats",
    "Racing Harness",
    "Harness Bar",
    "Steering Wheel",
    "Shift Knob",
    "Gauge Pod",
    "Roll Bar",
    "Fire Extinguisher Mount",
  ],
};

export function getManualPartBrandOptions(databaseBrands: string[]) {
  const merged = [
    ...PART_BRAND_SEEDS.map((brand) => brand.name),
    ...ADDITIONAL_JDM_PART_BRANDS,
    ...databaseBrands,
  ];

  return Array.from(new Set(merged.map((brand) => brand.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export function getManualPartTypeGroups(categories: Array<{ id: string; slug: string }>): ManualPartTypeGroup[] {
  return categories.map((category) => ({
    categoryId: category.id,
    categorySlug: category.slug,
    options: COMMON_PART_TYPES_BY_CATEGORY_SLUG[category.slug] ?? [],
  }));
}
