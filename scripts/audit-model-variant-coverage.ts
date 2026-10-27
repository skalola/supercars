import { prisma } from "@/lib/prisma";
import { MAKER_SITE_CONFIGS } from "@/lib/maker-sites/config";
import {
  canonicalEpaMakeName,
  fetchEpaVehicleRecords,
  normalizeMakeName,
  type EpaVehicleRecord,
} from "@/lib/model-catalog/sources/epa-fuel-economy";
import { findTrustedModelMatch, trustedModelIdentity } from "@/lib/model-catalog/trusted-model-matcher";
import { analyzeVariantCoverage } from "@/lib/model-catalog/variants/coverage";

async function main() {
  const makeFilter = process.argv.find((arg) => arg.startsWith("--make="))?.split("=")[1] || null;
  const strict = process.argv.includes("--strict");
  const configs = MAKER_SITE_CONFIGS.filter((config) => !makeFilter || config.slug === makeFilter);
  if (configs.length === 0) throw new Error(`Unknown maker slug: ${makeFilter}`);
  const makes = await prisma.make.findMany({
    where: { slug: { in: configs.map((config) => config.slug) } },
    select: {
      name: true,
      slug: true,
      models: {
        select: {
          id: true,
          name: true,
          slug: true,
          variants: { select: { name: true, slug: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const makeNames = new Set(makes.map((make) => normalizeMakeName(canonicalEpaMakeName(make.name))));
  const records = await fetchEpaVehicleRecords(makeNames);
  const totals = { families: 0, matchedFamilies: 0, ambiguousFamilies: 0, sourceVariants: 0, matchedVariants: 0, missingVariants: 0, catalogOnlyVariants: 0, familiesWithoutSourceVariants: 0 };
  const collisions: Array<{ make: string; sourceFamily: string; catalogModel: string }> = [];

  for (const make of makes) {
    const families = groupFamilies(
      records.filter((record) => normalizeMakeName(record.make) === normalizeMakeName(canonicalEpaMakeName(make.name))),
      make.name,
    );
    const row = { families: families.length, matchedFamilies: 0, ambiguousFamilies: 0, sourceVariants: 0, matchedVariants: 0, missingVariants: 0, catalogOnlyVariants: 0, familiesWithoutSourceVariants: 0 };
    const matchedModelIds = new Set<string>();
    for (const family of families) {
      const match = findTrustedModelMatch(family.name, make.name, make.models);
      const model = match?.model ? make.models.find((candidate) => candidate.id === match.model.id) : null;
      if (!model) { row.ambiguousFamilies += 1; continue; }
      if (matchedModelIds.has(model.id)) {
        row.ambiguousFamilies += 1;
        collisions.push({ make: make.name, sourceFamily: family.name, catalogModel: model.name });
        continue;
      }
      matchedModelIds.add(model.id);
      row.matchedFamilies += 1;
      const coverage = analyzeVariantCoverage(summarizeVariants(family.records), model.variants);
      row.sourceVariants += coverage.sourceVariantCount;
      row.matchedVariants += coverage.matchedCount;
      row.missingVariants += coverage.missing.length;
      row.catalogOnlyVariants += coverage.catalogOnly.length;
      if (coverage.status === "NO_SOURCE_VARIANTS") row.familiesWithoutSourceVariants += 1;
    }
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += row[key];
    console.log(`${make.name.padEnd(18)} families=${row.families.toString().padStart(3)} matched=${row.matchedFamilies.toString().padStart(3)} variants=${row.matchedVariants.toString().padStart(4)}/${row.sourceVariants.toString().padEnd(4)} missing=${row.missingVariants.toString().padStart(3)} catalog_only=${row.catalogOnlyVariants.toString().padStart(3)} source_single=${row.familiesWithoutSourceVariants.toString().padStart(3)}`);
  }
  console.log("\nVariant coverage totals");
  console.log(JSON.stringify(totals, null, 2));
  if (collisions.length > 0) {
    console.log("\nFamily collisions requiring source review");
    for (const collision of collisions) console.log(`- ${collision.make}: ${collision.sourceFamily} -> ${collision.catalogModel}`);
  }
  if (strict && (totals.missingVariants > 0 || totals.ambiguousFamilies > 0)) process.exitCode = 1;
}

function groupFamilies(records: EpaVehicleRecord[], makeName: string) {
  const groups = new Map<string, { name: string; records: EpaVehicleRecord[] }>();
  for (const record of records) {
    const key = trustedModelIdentity(record.baseModel, makeName);
    const group = groups.get(key) || { name: record.baseModel, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
}

function summarizeVariants(records: EpaVehicleRecord[]) {
  const groups = new Map<string, string>();
  for (const record of records) {
    if (normalizeName(record.model) === normalizeName(record.baseModel)) continue;
    groups.set(slugify(record.model), record.model);
  }
  return [...groups].map(([slug, name]) => ({ name, slug }));
}

function normalizeName(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

main().catch((error) => { console.error("[variant-coverage] Failed", error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
