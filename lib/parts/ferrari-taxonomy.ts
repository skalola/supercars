import { toPartSlug } from "@/lib/parts/slug";
import type { PrismaClient } from "@prisma/client";

export const FERRARI_PART_CATEGORIES = [
  "Maintenance & Service",
  "Engine",
  "Air Induction",
  "Fuel System",
  "Cooling",
  "Exhaust & Emissions",
  "ECU & Electronics",
  "Transmission & Drivetrain",
  "Suspension & Steering",
  "Brakes",
  "Wheels & Tires",
  "Body & Exterior",
  "Aerodynamics",
  "Interior",
  "Lighting",
  "Accessories & Care",
  "Performance Packages",
] as const;

export type FerrariPartCategory = (typeof FERRARI_PART_CATEGORIES)[number];

const CATEGORY_RULES: Array<{ category: FerrariPartCategory; terms: RegExp }> = [
  { category: "Maintenance & Service", terms: /service|maintenance|filter|lubric|fluid|belt|spark plug/i },
  { category: "Brakes", terms: /brake|caliper|disc|rotor|abs/i },
  { category: "Cooling", terms: /cool|radiator|water pump|thermostat|heat exchanger/i },
  { category: "Fuel System", terms: /fuel|inject|tank|pump/i },
  { category: "Exhaust & Emissions", terms: /exhaust|cataly|muffler|silencer|emission/i },
  { category: "Transmission & Drivetrain", terms: /gearbox|transmission|clutch|differential|drivetrain/i },
  { category: "Suspension & Steering", terms: /suspension|shock|damper|spring|wishbone|steering|steer/i },
  { category: "ECU & Electronics", terms: /electric|electronic|wiring|battery|alternator|control unit|sensor|ecu/i },
  { category: "Interior", terms: /interior|dashboard|seat|trim|carpet|cockpit/i },
  { category: "Wheels & Tires", terms: /wheel|tyre|tire|hub/i },
  { category: "Lighting", terms: /light|lamp|headlamp|taillamp/i },
  { category: "Accessories & Care", terms: /accessor|tool|cover|badge|emblem|manual|care/i },
  { category: "Performance Packages", terms: /package|power kit|stage [0-9]/i },
  { category: "Aerodynamics", terms: /aero|diffuser|splitter|wing|spoiler/i },
  { category: "Body & Exterior", terms: /body|chassis|panel|door|bumper|glass|roof|carbon/i },
  { category: "Air Induction", terms: /intake|airbox|throttle|turbo|supercharg|intercooler/i },
  { category: "Engine", terms: /engine|motor|cylinder|piston|crank|cam|valve|timing/i },
];

export function mapFerrariSourceCategory(sourceCategory: string): FerrariPartCategory {
  const match = CATEGORY_RULES.find((rule) => rule.terms.test(sourceCategory));
  return match?.category ?? "Accessories & Care";
}

export function getFerrariCategorySlug(category: FerrariPartCategory) {
  const aliases: Partial<Record<FerrariPartCategory, string>> = {
    "Maintenance & Service": "maintenance-service",
    "Air Induction": "air-induction",
    "Fuel System": "fuel-system",
    "Exhaust & Emissions": "exhaust-emissions",
    "ECU & Electronics": "ecu-electronics",
    "Transmission & Drivetrain": "transmission-drivetrain",
    "Suspension & Steering": "suspension-steering",
    "Wheels & Tires": "wheels-tires",
    "Body & Exterior": "body-exterior",
    "Accessories & Care": "accessories-care",
    "Performance Packages": "performance-packages",
  };
  return aliases[category] ?? toPartSlug(category);
}

export function normalizeOemPartNumber(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function buildFerrariCanonicalPartKey(oemPartNumber: string) {
  return `ferrari:${normalizeOemPartNumber(oemPartNumber)}`;
}

export async function ensureFerrariPartTaxonomy(prisma: PrismaClient) {
  await Promise.all(FERRARI_PART_CATEGORIES.map((category, index) => {
    const slug = getFerrariCategorySlug(category);
    return prisma.partCategory.upsert({
      where: { slug },
      update: { active: true },
      create: {
        name: category,
        slug,
        description: `Normalized Ferrari ${category.toLowerCase()} catalog parts.`,
        displayOrder: index * 10 + 10,
        active: true,
      },
    });
  }));
}
