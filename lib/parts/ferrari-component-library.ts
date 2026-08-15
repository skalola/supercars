import { toPartSlug } from "@/lib/parts/slug";
import { evaluateFerrariComponentApplicability } from "@/lib/parts/ferrari-applicability";

export type FerrariComponentSeed = {
  name: string;
  aliases?: string[];
  systemGroup?: string;
  fitmentRisk?: "LOW" | "MEDIUM" | "HIGH";
  material?: string;
  replacementType?: string;
  performance?: boolean;
  turboOnly?: boolean;
  hybridOnly?: boolean;
  modernOnly?: boolean;
};

export type FerrariComponentCategorySeed = {
  name: string;
  slug: string;
  description: string;
  components: Array<string | FerrariComponentSeed>;
};

const category = (name: string, slug: string, components: Array<string | FerrariComponentSeed>): FerrariComponentCategorySeed => ({
  name,
  slug,
  description: `Permanent Ferrari ${name.toLowerCase()} component types used for vehicle-aware parts discovery.`,
  components,
});

export const LEGACY_FERRARI_COMPONENT_LIBRARY: FerrariComponentCategorySeed[] = [
  category("Maintenance", "maintenance", [
    "Oil Filter", "Engine Air Filter", "Cabin Air Filter", "Fuel Filter", "Spark Plugs", "Ignition Coils", "Drive Belt",
    "Accessory Belt", "Battery", "Battery Tender", "Oil Service Kit", "Coolant", "Brake Fluid", "Transmission Fluid",
    "Gearbox Service Kit", "Wiper Blade",
  ]),
  category("Engine", "engine", [
    "Engine Mount", "Engine Gasket", "Valve Cover Gasket", "Engine Sensor", "Crankshaft Sensor", "Camshaft Sensor",
    "Knock Sensor", "Oxygen Sensor", "Pulley", "Tensioner", "Engine Hose", "Engine Cover", "Engine Hardware",
    "Oil Pan", "Oil Pump",
  ]),
  category("Intake", "intake", [
    "Air Filter", { name: "Performance Air Filter", performance: true }, "Airbox", { name: "Intake System", performance: true },
    "Intake Hose", "Intake Manifold", "Throttle Body", "Mass Air Sensor", { name: "Carbon Intake", performance: true },
  ]),
  category("Exhaust", "exhaust", [
    "OEM Exhaust", { name: "Performance Exhaust", performance: true }, "Rear Muffler", { name: "Cat-Back Exhaust", performance: true },
    { name: "Headers", performance: true }, "Exhaust Manifold", { name: "Downpipe", performance: true, turboOnly: true },
    "Catalytic Converter", "Sport Catalyst", "Test Pipe", "Exhaust Valve", "Exhaust Valve Controller", "Exhaust Tip", "Heat Shield",
  ]),
  category("ECU & Tuning", "ecu-tuning", [
    { name: "ECU", modernOnly: true }, { name: "ECU Tune", performance: true, modernOnly: true },
    { name: "Piggyback Module", performance: true, modernOnly: true }, { name: "TCU Tune", performance: true, modernOnly: true },
    { name: "Power Module", performance: true, modernOnly: true }, { name: "Transmission Controller", modernOnly: true },
  ]),
  category("Forced Induction", "forced-induction", [
    { name: "Turbocharger", performance: true, turboOnly: true }, { name: "Charge Pipes", performance: true, turboOnly: true },
    { name: "Wastegate", performance: true, turboOnly: true }, { name: "Blow-Off Valve", performance: true, turboOnly: true },
    { name: "Boost Controller", performance: true, turboOnly: true }, { name: "Turbo Heat Shield", turboOnly: true },
  ]),
  category("Cooling", "cooling", [
    "Radiator", { name: "Intercooler", performance: true, turboOnly: true }, "Oil Cooler", "Transmission Cooler", "Water Pump",
    "Thermostat", "Cooling Hose", "Cooling Fan", "Expansion Tank", "Coolant Reservoir",
  ]),
  category("Fuel", "fuel", [
    "Fuel Pump", "Fuel Injector", "Fuel Rail", "Fuel Filter", "Fuel Pressure Sensor", "Fuel Line", "Fuel Tank Component",
  ]),
  category("Transmission", "transmission", [
    "Clutch", "Clutch Kit", "Flywheel", "Transmission Mount", "Gearbox Component", "Shift Component", "Differential",
    "Differential Mount", "CV Joint", "Axle",
  ]),
  category("Suspension", "suspension", [
    "Spring", { name: "Lowering Spring", performance: true }, { name: "Coilover", performance: true }, "Shock Absorber",
    "Damper", "Control Arm", "Ball Joint", "Bushing", { name: "Sway Bar", performance: true }, "End Link", "Ride Height Sensor",
  ]),
  category("Steering", "steering", [
    "Tie Rod", "Steering Rack", "Power Steering Component", { name: "Steering Sensor", modernOnly: true },
  ]),
  category("Brakes", "brakes", [
    { name: "Front Brake Pads", aliases: ["front pads", "front brake pad set", "brake pad set"] },
    { name: "Rear Brake Pads", aliases: ["rear pads", "rear brake pad set"] }, "Front Brake Rotors", "Rear Brake Rotors",
    "Carbon Ceramic Rotor", "Brake Caliper", "Brake Line", "Brake Hose", "Brake Wear Sensor", "Brake Fluid",
    { name: "Complete Brake Kit", performance: true },
  ]),
  category("Wheels", "wheels", [
    "OEM Wheel", { name: "Aftermarket Wheel", performance: true }, { name: "Forged Wheel", performance: true }, "Wheel Bolt",
    "Wheel Nut", "Center Cap", "Wheel Spacer", { name: "TPMS Sensor", modernOnly: true },
  ]),
  category("Tires", "tires", [
    "Summer Performance Tire", { name: "Track Tire", performance: true }, "All-Season Tire",
  ]),
  category("Aerodynamics", "aerodynamics", [
    { name: "Front Splitter", performance: true }, { name: "Front Lip", performance: true }, { name: "Rear Diffuser", performance: true },
    { name: "Rear Wing", performance: true }, "Spoiler", "Side Skirt", "Canard", "Undertray",
  ]),
  category("Body", "body", [
    "Front Bumper", "Rear Bumper", "Hood", "Fender", "Door", "Mirror", "Mirror Assembly", "Grille", "Side Panel",
    "Engine Cover", "Trunk Deck Lid",
  ]),
  category("Carbon Fiber", "carbon-fiber", [
    { name: "Carbon Front Splitter", performance: true }, { name: "Carbon Rear Diffuser", performance: true }, "Carbon Mirror Cap",
    "Carbon Side Skirt", "Carbon Engine Cover", "Carbon Interior Trim", "Carbon Steering Wheel Component",
  ]),
  category("Interior", "interior", [
    "Seat", "Racing Seat", "Steering Wheel", "Paddle Shifter", "Floor Mat", "Pedal", "Switch", "Button", "Interior Trim",
    "Dashboard Component", { name: "Infotainment Component", modernOnly: true },
  ]),
  category("Electrical", "electrical", [
    "Sensor", { name: "ECU", modernOnly: true }, { name: "Control Module", modernOnly: true }, "Fuse", "Relay", "Wiring Harness",
    "Battery", "Starter", "Alternator", { name: "Hybrid Battery Component", hybridOnly: true, modernOnly: true },
    { name: "Hybrid Control Module", hybridOnly: true, modernOnly: true },
  ]),
  category("Lighting", "lighting", ["Headlight", "Tail Light", "Side Marker", "Turn Signal", "Interior Light"]),
  category("Accessories", "accessories", [
    "Car Cover", "Battery Tender", "Floor Mat", "License Plate Frame", "Tool Kit", "Luggage", "Storage Accessory",
  ]),
  category("Performance", "performance", [
    { name: "Exhaust Upgrade", performance: true }, { name: "Intake Upgrade", performance: true },
    { name: "ECU Tune", performance: true, modernOnly: true }, { name: "Suspension Upgrade", performance: true },
    { name: "Brake Upgrade", performance: true }, { name: "Forged Wheels", performance: true },
    { name: "Carbon Aero", performance: true }, { name: "Weight Reduction Component", performance: true },
  ]),
];

export const AUTOMOTIVE_PART_SYSTEMS = [
  { name: "Maintenance & Service", slug: "maintenance-service" },
  { name: "Engine", slug: "engine" },
  { name: "Air Induction", slug: "air-induction" },
  { name: "Fuel System", slug: "fuel-system" },
  { name: "Cooling", slug: "cooling" },
  { name: "Exhaust & Emissions", slug: "exhaust-emissions" },
  { name: "ECU & Electronics", slug: "ecu-electronics" },
  { name: "Transmission & Drivetrain", slug: "transmission-drivetrain" },
  { name: "Suspension & Steering", slug: "suspension-steering" },
  { name: "Brakes", slug: "brakes" },
  { name: "Wheels & Tires", slug: "wheels-tires" },
  { name: "Body & Exterior", slug: "body-exterior" },
  { name: "Aerodynamics", slug: "aerodynamics" },
  { name: "Interior", slug: "interior" },
  { name: "Lighting", slug: "lighting" },
  { name: "Accessories & Care", slug: "accessories-care" },
  { name: "Performance Packages", slug: "performance-packages" },
] as const;

export const LEGACY_CATEGORY_SYSTEM_MAP: Record<string, { system: string; group: string }> = {
  "maintenance-service": { system: "maintenance-service", group: "ROUTINE_SERVICE" },
  maintenance: { system: "maintenance-service", group: "ROUTINE_SERVICE" },
  engine: { system: "engine", group: "ENGINE_CORE" },
  intake: { system: "air-induction", group: "INTAKE_TRACT" },
  "air-induction": { system: "air-induction", group: "INTAKE_TRACT" },
  "forced-induction": { system: "air-induction", group: "FORCED_INDUCTION" },
  cooling: { system: "cooling", group: "COOLING_SYSTEM" },
  fuel: { system: "fuel-system", group: "FUEL_DELIVERY" },
  "fuel-system": { system: "fuel-system", group: "FUEL_DELIVERY" },
  exhaust: { system: "exhaust-emissions", group: "EXHAUST" },
  "exhaust-emissions": { system: "exhaust-emissions", group: "EXHAUST" },
  "ecu-tuning": { system: "ecu-electronics", group: "TUNING" },
  electrical: { system: "ecu-electronics", group: "POWER_WIRING" },
  "ecu-electronics": { system: "ecu-electronics", group: "POWER_WIRING" },
  transmission: { system: "transmission-drivetrain", group: "DRIVETRAIN" },
  "transmission-drivetrain": { system: "transmission-drivetrain", group: "DRIVETRAIN" },
  suspension: { system: "suspension-steering", group: "SUSPENSION" },
  steering: { system: "suspension-steering", group: "STEERING" },
  "suspension-steering": { system: "suspension-steering", group: "SUSPENSION" },
  drivetrain: { system: "transmission-drivetrain", group: "DRIVETRAIN" },
  fueling: { system: "fuel-system", group: "FUEL_DELIVERY" },
  "aero-body": { system: "aerodynamics", group: "AERO" },
  "interior-safety": { system: "interior", group: "CABIN" },
  "performance-modifications": { system: "performance-packages", group: "PACKAGES" },
  brakes: { system: "brakes", group: "BRAKING" },
  wheels: { system: "wheels-tires", group: "WHEELS" },
  tires: { system: "wheels-tires", group: "TIRES" },
  "wheels-tires": { system: "wheels-tires", group: "WHEELS" },
  body: { system: "body-exterior", group: "BODY" },
  "carbon-fiber": { system: "body-exterior", group: "BODY" },
  "body-exterior": { system: "body-exterior", group: "BODY" },
  aerodynamics: { system: "aerodynamics", group: "AERO" },
  interior: { system: "interior", group: "CABIN" },
  lighting: { system: "lighting", group: "LIGHTING" },
  accessories: { system: "accessories-care", group: "ACCESSORIES" },
  "accessories-care": { system: "accessories-care", group: "ACCESSORIES" },
  performance: { system: "performance-packages", group: "PACKAGES" },
  "performance-packages": { system: "performance-packages", group: "PACKAGES" },
};

type ComponentOverride = Partial<FerrariComponentSeed> & { system?: string };

const COMPONENT_OVERRIDES: Record<string, ComponentOverride> = {
  "intake:air-filter": { system: "maintenance-service", name: "Engine Air Filter", systemGroup: "FILTERS", replacementType: "OEM_EQUIVALENT" },
  "intake:performance-air-filter": { system: "maintenance-service", name: "Engine Air Filter", systemGroup: "FILTERS", replacementType: "PERFORMANCE" },
  "maintenance:engine-air-filter": { systemGroup: "FILTERS", aliases: ["air filter", "air cleaner", "replacement air filter", "panel filter", "performance air filter", "high flow filter"] },
  "maintenance:cabin-air-filter": { systemGroup: "FILTERS", aliases: ["cabin filter", "pollen filter"] },
  "maintenance:fuel-filter": { systemGroup: "FILTERS" },
  "fuel:fuel-filter": { system: "maintenance-service", systemGroup: "FILTERS" },
  "brakes:brake-fluid": { system: "maintenance-service", systemGroup: "FLUIDS" },
  "electrical:battery": { system: "maintenance-service", systemGroup: "ELECTRICAL_SERVICE" },
  "maintenance:battery-tender": { system: "accessories-care", systemGroup: "CARE_POWER" },
  "accessories:floor-mat": { system: "interior", systemGroup: "CABIN_PROTECTION" },
  "electrical:ecu": { systemGroup: "CONTROL" },
  "ecu-tuning:ecu": { systemGroup: "CONTROL" },
  "intake:mass-air-sensor": { system: "ecu-electronics", systemGroup: "SENSORS" },
  "body:engine-cover": { system: "engine", systemGroup: "ENGINE_COVERS" },
  "carbon-fiber:carbon-engine-cover": { system: "engine", name: "Engine Cover", systemGroup: "ENGINE_COVERS", material: "CARBON_FIBER" },
  "carbon-fiber:carbon-front-splitter": { system: "aerodynamics", name: "Front Splitter", systemGroup: "FRONT_AERO", material: "CARBON_FIBER" },
  "carbon-fiber:carbon-rear-diffuser": { system: "aerodynamics", name: "Rear Diffuser", systemGroup: "REAR_AERO", material: "CARBON_FIBER" },
  "carbon-fiber:carbon-side-skirt": { system: "aerodynamics", name: "Side Skirt", systemGroup: "SIDE_AERO", material: "CARBON_FIBER" },
  "carbon-fiber:carbon-mirror-cap": { system: "body-exterior", name: "Mirror Cap", systemGroup: "MIRRORS", material: "CARBON_FIBER" },
  "carbon-fiber:carbon-interior-trim": { system: "interior", name: "Interior Trim", systemGroup: "TRIM", material: "CARBON_FIBER" },
  "carbon-fiber:carbon-steering-wheel-component": { system: "interior", name: "Steering Wheel Component", systemGroup: "DRIVER_CONTROLS", material: "CARBON_FIBER" },
  "performance:exhaust-upgrade": { system: "exhaust-emissions", name: "Performance Exhaust", systemGroup: "PERFORMANCE_EXHAUST" },
  "performance:intake-upgrade": { system: "air-induction", name: "Intake System", systemGroup: "INTAKE_TRACT" },
  "performance:ecu-tune": { system: "ecu-electronics", systemGroup: "TUNING" },
  "performance:suspension-upgrade": { system: "suspension-steering", name: "Suspension Kit", systemGroup: "SUSPENSION" },
  "performance:brake-upgrade": { system: "brakes", name: "Complete Brake Kit", systemGroup: "KITS" },
  "performance:forged-wheels": { system: "wheels-tires", name: "Forged Wheel", systemGroup: "WHEELS" },
  "performance:carbon-aero": { system: "aerodynamics", name: "Aero Package", systemGroup: "AERO_PACKAGES", material: "CARBON_FIBER" },
  "performance:weight-reduction-component": { system: "body-exterior", name: "Lightweight Body Component", systemGroup: "LIGHTWEIGHT_BODY" },
};

export function resolveAutomotiveComponent(categorySlug: string, rawComponent: string | FerrariComponentSeed) {
  const component = normalizeFerrariComponent(rawComponent);
  const sourceKey = `${categorySlug}:${toPartSlug(component.name)}`;
  const category = LEGACY_CATEGORY_SYSTEM_MAP[categorySlug];
  const override = COMPONENT_OVERRIDES[sourceKey] ?? {};
  const systemSlug = override.system ?? category?.system ?? "accessories-care";
  const name = override.name ?? component.name;
  return {
    ...component,
    ...override,
    name,
    aliases: [...new Set([
      component.name.toLowerCase(),
      ...(component.aliases ?? []),
      ...(override.aliases ?? []),
    ].map((alias) => alias.toLowerCase()))],
    systemSlug,
    systemGroup: override.systemGroup ?? component.systemGroup ?? category?.group ?? "OTHER",
    fitmentRisk: override.fitmentRisk ?? component.fitmentRisk ?? inferComponentFitmentRisk(name),
  } satisfies FerrariComponentSeed & { systemSlug: string };
}

export function getFerrariComponentMigrationMap() {
  return LEGACY_FERRARI_COMPONENT_LIBRARY.flatMap((categorySeed) => categorySeed.components.map((component) => {
    const source = normalizeFerrariComponent(component);
    const target = resolveAutomotiveComponent(categorySeed.slug, component);
    return {
      oldCategory: categorySeed.slug,
      oldComponent: source.name,
      oldSlug: toPartSlug(source.name),
      newCategory: target.systemSlug,
      newComponent: target.name,
      newSlug: toPartSlug(target.name),
      systemGroup: target.systemGroup ?? "OTHER",
      fitmentRisk: target.fitmentRisk ?? "MEDIUM",
      material: target.material ?? null,
      replacementType: target.replacementType ?? null,
    };
  }));
}

export const FERRARI_COMPONENT_LIBRARY: FerrariComponentCategorySeed[] = AUTOMOTIVE_PART_SYSTEMS.map((system) => {
  const components = new Map<string, FerrariComponentSeed>();
  for (const legacyCategory of LEGACY_FERRARI_COMPONENT_LIBRARY) {
    for (const rawComponent of legacyCategory.components) {
      const resolved = resolveAutomotiveComponent(legacyCategory.slug, rawComponent);
      if (resolved.systemSlug !== system.slug) continue;
      const slug = toPartSlug(resolved.name);
      const existing = components.get(slug);
      components.set(slug, existing ? {
        ...existing,
        aliases: [...new Set([...(existing.aliases ?? []), ...(resolved.aliases ?? [])])],
        performance: existing.performance || resolved.performance,
        material: existing.material ?? resolved.material,
        replacementType: existing.replacementType ?? resolved.replacementType,
      } : resolved);
    }
  }
  if (system.slug === "performance-packages") {
    for (const component of [
      { name: "Stage 1 Package", aliases: ["stage one package"], performance: true, modernOnly: true, systemGroup: "POWER_PACKAGES", fitmentRisk: "HIGH" as const },
      { name: "Exhaust + ECU Package", aliases: ["exhaust ecu package"], performance: true, modernOnly: true, systemGroup: "POWER_PACKAGES", fitmentRisk: "HIGH" as const },
      { name: "Power Package", aliases: ["performance power package"], performance: true, modernOnly: true, systemGroup: "POWER_PACKAGES", fitmentRisk: "HIGH" as const },
      { name: "Track Package", aliases: ["track performance package"], performance: true, modernOnly: true, systemGroup: "TRACK_PACKAGES", fitmentRisk: "HIGH" as const },
    ]) components.set(toPartSlug(component.name), component);
  }
  return category(system.name, system.slug, [...components.values()]);
});

function inferComponentFitmentRisk(name: string): "LOW" | "MEDIUM" | "HIGH" {
  if (/car cover|battery tender|floor mat|wiper|fluid|coolant|oil service|license plate|tool kit|luggage|storage/i.test(name)) return "LOW";
  if (/ecu|control module|transmission|gearbox|turbo|supercharger|intercooler|engine internal|oil pump|body|bumper|hood|fender|door|carbon ceramic|control arm|steering rack/i.test(name)) return "HIGH";
  return "MEDIUM";
}

export const FERRARI_AFTERMARKET_QUERY_BRANDS: Record<string, string[]> = {
  "maintenance-service": ["BMC", "K&N", "Bosch", "Mahle", "Mann", "NGK"],
  "air-induction": ["Eventuri", "Novitec", "BMC", "K&N"],
  "exhaust-emissions": ["Capristo", "Novitec", "Akrapovic"],
  "ecu-electronics": ["Novitec", "Bosch"],
  brakes: ["Brembo"],
  "suspension-steering": ["KW", "Ohlins"],
  "wheels-tires": ["BBS", "HRE", "Michelin", "Pirelli"],
  aerodynamics: ["Novitec"],
  "body-exterior": ["Novitec"],
  "performance-packages": ["Capristo", "Novitec", "Brembo"],
};

export const FERRARI_PART_BRANDS = [
  "Ferrari", "Brembo", "Bosch", "Mahle", "Mann", "NGK", "Pirelli", "Michelin", "Shell", "Capristo",
  "Novitec", "Akrapovic", "Eventuri", "HRE", "BBS", "KW", "Ohlins", "Bilstein", "Eibach", "K&N", "Sabelt",
] as const;

export function normalizeFerrariComponent(component: string | FerrariComponentSeed): FerrariComponentSeed {
  return typeof component === "string" ? { name: component } : component;
}

export function getFerrariComponentSlug(component: string | FerrariComponentSeed) {
  return toPartSlug(normalizeFerrariComponent(component).name);
}

export function getFerrariComponentSearchTemplates(categorySlug: string, componentName: string) {
  if (!componentName.trim()) return [];
  const templates = [
    "{make} {model} {component}",
    "{year} {make} {model} {component}",
  ];
  for (const brand of FERRARI_AFTERMARKET_QUERY_BRANDS[categorySlug] ?? []) {
    templates.push(`{make} {model} ${brand} {component}`);
  }
  return templates;
}

export function getFerrariComponentAliases(component: FerrariComponentSeed) {
  const normalized = component.name.toLowerCase();
  const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
  return [...new Set([normalized, singular, ...(component.aliases ?? []).map((alias) => alias.toLowerCase())])];
}

export function isFerrariComponentApplicable(
  component: FerrariComponentSeed,
  model: { productionStartYear: number | null; productionEndYear: number | null; engine: string | null; category: string | null; transmission?: string | null; drivetrain?: string | null; bodyStyle?: string | null },
) {
  return evaluateFerrariComponentApplicability(component, model).publiclyApplicable;
}
