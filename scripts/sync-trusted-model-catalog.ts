import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { MAKER_SITE_CONFIGS } from "@/lib/maker-sites/config";
import {
  canonicalEpaMakeName,
  EPA_SOURCE_NAME,
  EPA_VEHICLE_DATA_URL,
  fetchEpaVehicleRecords,
  normalizeMakeName,
  type EpaVehicleRecord,
} from "@/lib/model-catalog/sources/epa-fuel-economy";
import { findTrustedModelMatch, slugifyTrustedModel, trustedModelIdentity } from "@/lib/model-catalog/trusted-model-matcher";
import { analyzeVariantCoverage } from "@/lib/model-catalog/variants/coverage";

const prisma = new PrismaClient();

type Options = {
  apply: boolean;
  makeSlug: string | null;
  createModels: boolean;
};

type CatalogModel = {
  id: string;
  name: string;
  slug: string;
  productionStartYear: number | null;
  productionEndYear: number | null;
  category: string | null;
  bodyStyle: string | null;
  spec: {
    engine: string | null;
    displacement: string | null;
    cylinders: string | null;
    transmission: string | null;
    drivetrain: string | null;
  } | null;
  variants: Array<{
    id: string;
    name: string;
    slug: string;
    productionStartYear: number | null;
    productionEndYear: number | null;
  }>;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const selectedConfigs = MAKER_SITE_CONFIGS.filter((config) => !options.makeSlug || config.slug === options.makeSlug);
  if (selectedConfigs.length === 0) throw new Error(`Unknown maker slug: ${options.makeSlug}`);

  const makes = await prisma.make.findMany({
    where: { slug: { in: selectedConfigs.map((config) => config.slug) } },
    select: {
      id: true,
      name: true,
      slug: true,
      models: {
        select: {
          id: true,
          name: true,
          slug: true,
          productionStartYear: true,
          productionEndYear: true,
          category: true,
          bodyStyle: true,
          spec: {
            select: {
              engine: true,
              displacement: true,
              cylinders: true,
              transmission: true,
              drivetrain: true,
            },
          },
          variants: {
            select: {
              id: true,
              name: true,
              slug: true,
              productionStartYear: true,
              productionEndYear: true,
            },
          },
        },
      },
    },
  });
  const makeNames = new Set(makes.map((make) => normalizeMakeName(canonicalEpaMakeName(make.name))));
  console.log(`[trusted-models] Downloading one EPA catalog snapshot for ${makes.length} configured makes.`);
  const sourceRecords = await fetchEpaVehicleRecords(makeNames);

  const report = {
    mode: options.apply ? "APPLY" : "AUDIT ONLY",
    sourceRecords: sourceRecords.length,
    sourceFamilies: 0,
    matchedModels: 0,
    modelsCreated: 0,
    yearRangesUpdated: 0,
    specsCreated: 0,
    specFieldsFilled: 0,
    sourceVariants: 0,
    variantsMatched: 0,
    variantsCreated: 0,
    catalogOnlyVariants: 0,
    familiesWithoutSourceVariants: 0,
    profilesUpserted: 0,
    evidenceUpserted: 0,
    ambiguousFamilies: 0,
  };

  for (const make of makes.sort((a, b) => a.name.localeCompare(b.name))) {
    const records = sourceRecords.filter((record) => normalizeMakeName(record.make) === normalizeMakeName(canonicalEpaMakeName(make.name)));
    const families = groupFamilies(records, make.name);
    const enrichedModelIds = new Set<string>();
    report.sourceFamilies += families.length;
    let makeCreates = 0;
    let makeMatches = 0;

    for (const family of families) {
      const matching = findTrustedModelMatch(family.name, make.name, make.models);
      let model = matching?.model ? make.models.find((candidate) => candidate.id === matching.model.id) || null : null;
      if (model) {
        if (enrichedModelIds.has(model.id)) {
          report.ambiguousFamilies += 1;
          continue;
        }
        enrichedModelIds.add(model.id);
        makeMatches += 1;
        report.matchedModels += 1;
      } else if (!options.createModels) {
        report.ambiguousFamilies += 1;
        continue;
      }

      const summary = summarizeFamily(family.records);
      if (!model) {
        report.modelsCreated += 1;
        makeCreates += 1;
        if (!options.apply) continue;
        const created = await prisma.model.create({
          data: {
            makeId: make.id,
            name: family.name,
            slug: uniqueSlug(family.name, make.models),
            years: formatYears(summary.firstYear, summary.lastYear),
            productionStartYear: summary.firstYear,
            productionEndYear: summary.lastYear,
            category: summary.category,
            bodyStyle: summary.bodyStyle,
            metadataStatus: "PARTIAL",
            metadataConfidence: 0.98,
            metadataSource: EPA_SOURCE_NAME,
            metadataSourceUrl: EPA_VEHICLE_DATA_URL,
            lastMetadataAuditAt: new Date(),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            productionStartYear: true,
            productionEndYear: true,
            category: true,
            bodyStyle: true,
            spec: {
              select: {
                engine: true,
                displacement: true,
                cylinders: true,
                transmission: true,
                drivetrain: true,
              },
            },
            variants: {
              select: {
                id: true,
                name: true,
                slug: true,
                productionStartYear: true,
                productionEndYear: true,
              },
            },
          },
        });
        model = created;
        enrichedModelIds.add(created.id);
        make.models.push(created);
      }

      const yearData = yearRangeUpdate(model, summary.firstYear, summary.lastYear);
      if (Object.keys(yearData).length > 0) report.yearRangesUpdated += 1;
      const specData = missingSpecFields(model.spec, summary);
      report.specFieldsFilled += Object.keys(specData).length;
      if (!model.spec) report.specsCreated += 1;
      const variants = summarizeVariants(family.records);
      const variantCoverage = analyzeVariantCoverage(variants, model.variants);
      report.sourceVariants += variantCoverage.sourceVariantCount;
      report.variantsMatched += variantCoverage.matchedCount;
      report.variantsCreated += variantCoverage.missing.length;
      report.catalogOnlyVariants += variantCoverage.catalogOnly.length;
      if (variantCoverage.status === "NO_SOURCE_VARIANTS") report.familiesWithoutSourceVariants += 1;
      report.profilesUpserted += 1;
      report.evidenceUpserted += buildEvidence(summary).length;

      if (!options.apply) continue;
      await prisma.$transaction(async (tx) => {
        const catalogEvidenceKey = hash(`EPA:${make.id}:${family.name}`);
        await tx.modelCatalogEvidence.upsert({
          where: { evidenceKey: catalogEvidenceKey },
          create: {
            evidenceKey: catalogEvidenceKey,
            sourceType: "EPA",
            sourceName: EPA_SOURCE_NAME,
            sourceUrl: EPA_VEHICLE_DATA_URL,
            externalId: summary.representative.sourceId,
            makeName: make.name,
            modelName: summary.representative.model,
            canonicalFamilyName: family.name,
            normalizedFamilyKey: `${normalizeMakeName(make.name)}:${normalizeMakeName(family.name)}`,
            productionStartYear: summary.firstYear,
            productionEndYear: summary.lastYear,
            bodyStyle: summary.bodyStyle,
            category: summary.category,
            confidence: "HIGH",
            reviewStatus: "SOURCE_VERIFIED",
            makeId: make.id,
            modelId: model!.id,
          },
          update: {
            lastSeenAt: new Date(),
            externalId: summary.representative.sourceId,
            productionStartYear: summary.firstYear,
            productionEndYear: summary.lastYear,
            modelId: model!.id,
          },
        });
        if (Object.keys(yearData).length > 0 || !model?.category || !model.bodyStyle) {
          await tx.model.update({
            where: { id: model!.id },
            data: {
              ...yearData,
              category: model!.category || summary.category,
              bodyStyle: model!.bodyStyle || summary.bodyStyle,
              lastMetadataAuditAt: new Date(),
            },
          });
        }
        if (!model!.spec) {
          await tx.modelSpec.upsert({
            where: { modelId: model!.id },
            create: { modelId: model!.id, ...specData },
            update: {},
          });
        } else if (Object.keys(specData).length > 0) {
          await tx.modelSpec.update({ where: { modelId: model!.id }, data: specData });
        }

        const newVariants = variantCoverage.missing;
        if (newVariants.length > 0) {
          await tx.modelVariant.createMany({
            data: newVariants.map((variant) => ({ modelId: model!.id, ...variant })),
            skipDuplicates: true,
          });
        }

        const persistedVariants = variants.length > 0
          ? await tx.modelVariant.findMany({
              where: { modelId: model!.id, slug: { in: variants.map((variant) => variant.slug) } },
              select: { id: true, name: true, slug: true },
            })
          : [];
        const sourceBySlug = new Map(variants.map((variant) => [variant.slug, variant]));
        if (persistedVariants.length > 0) {
          await tx.modelCatalogEvidence.createMany({
            data: persistedVariants.map((variant) => {
              const source = sourceBySlug.get(variant.slug)!;
              return {
                evidenceKey: hash(`EPA:${make.id}:${family.name}:${variant.slug}`),
                sourceType: "EPA",
                sourceName: EPA_SOURCE_NAME,
                sourceUrl: EPA_VEHICLE_DATA_URL,
                externalId: source.externalId,
                makeName: make.name,
                modelName: source.name,
                canonicalFamilyName: family.name,
                normalizedFamilyKey: `${normalizeMakeName(make.name)}:${normalizeMakeName(family.name)}`,
                productionStartYear: source.productionStartYear,
                productionEndYear: source.productionEndYear,
                confidence: "HIGH",
                reviewStatus: "SOURCE_VERIFIED",
                makeId: make.id,
                modelId: model!.id,
                variantId: variant.id,
              };
            }),
            skipDuplicates: true,
          });
        }

        const profileKey = `${model!.id}:epa-representative`;
        const profile = await tx.modelEngineeringProfile.upsert({
          where: { profileKey },
          create: {
            profileKey,
            modelId: model!.id,
            scope: "MODEL_YEAR_REPRESENTATIVE",
            yearStart: summary.representative.year,
            yearEnd: summary.representative.year,
            engineDescription: summary.engine,
            displacementLiters: summary.representative.displacementLiters,
            cylinders: summary.representative.cylinders,
            fuelType: summary.representative.fuelType,
            vehicleClass: summary.representative.vehicleClass,
            aspiration: summary.representative.aspiration,
            drivetrain: normalizeDrivetrain(summary.representative.drivetrain),
            transmissionType: normalizeTransmission(summary.representative.transmission),
            transmissionDescription: summary.representative.transmission,
            confidence: "HIGH",
            reviewStatus: "SOURCE_VERIFIED",
          },
          update: {
            yearStart: summary.representative.year,
            yearEnd: summary.representative.year,
            engineDescription: summary.engine,
            displacementLiters: summary.representative.displacementLiters,
            cylinders: summary.representative.cylinders,
            fuelType: summary.representative.fuelType,
            vehicleClass: summary.representative.vehicleClass,
            aspiration: summary.representative.aspiration,
            drivetrain: normalizeDrivetrain(summary.representative.drivetrain),
            transmissionType: normalizeTransmission(summary.representative.transmission),
            transmissionDescription: summary.representative.transmission,
            confidence: "HIGH",
            reviewStatus: "SOURCE_VERIFIED",
          },
          select: { id: true },
        });

        for (const evidence of buildEvidence(summary)) {
          const evidenceKey = hash(`${profileKey}:${evidence.fieldName}:${summary.representative.sourceId}`);
          await tx.modelEngineeringEvidence.upsert({
            where: { evidenceKey },
            create: {
              evidenceKey,
              profileId: profile.id,
              ...evidence,
            },
            update: {
              rawValue: evidence.rawValue,
              sourceUrl: evidence.sourceUrl,
              capturedAt: new Date(),
            },
          });
        }
      });
    }

    console.log(`[trusted-models] ${make.name}: ${families.length} EPA families, ${makeMatches} matched, ${makeCreates} new.`);
  }

  console.log(JSON.stringify(report, null, 2));
}

function groupFamilies(records: EpaVehicleRecord[], makeName: string) {
  const groups = new Map<string, { name: string; records: EpaVehicleRecord[] }>();
  for (const record of records) {
    const key = trustedModelIdentity(record.baseModel, makeName);
    const group = groups.get(key) || { name: record.baseModel, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function summarizeFamily(records: EpaVehicleRecord[]) {
  const firstYear = Math.min(...records.map((record) => record.year));
  const lastYear = Math.max(...records.map((record) => record.year));
  const latest = records.filter((record) => record.year === lastYear);
  const representative = [...latest].sort((a, b) => completeness(b) - completeness(a) || a.model.localeCompare(b.model))[0];
  const engine = formatEngine(representative);
  return {
    firstYear,
    lastYear,
    representative,
    engine,
    displacement: representative.displacementLiters ? `${representative.displacementLiters.toFixed(1)} L` : null,
    cylinders: representative.cylinders ? String(representative.cylinders) : null,
    transmission: representative.transmission,
    drivetrain: representative.drivetrain,
    category: categoryFromClass(representative.vehicleClass),
    bodyStyle: bodyStyleFromClass(representative.vehicleClass),
  };
}

export function summarizeVariants(records: EpaVehicleRecord[]) {
  const groups = new Map<string, { name: string; years: number[]; externalIds: string[] }>();
  for (const record of records) {
    if (normalizeName(record.model) === normalizeName(record.baseModel)) continue;
    const slug = slugifyTrustedModel(record.model);
    const group = groups.get(slug) || { name: record.model, years: [], externalIds: [] };
    group.years.push(record.year);
    group.externalIds.push(record.sourceId);
    groups.set(slug, group);
  }
  return [...groups.entries()].map(([slug, group]) => ({
    name: group.name,
    slug,
    productionStartYear: Math.min(...group.years),
    productionEndYear: Math.max(...group.years),
    externalId: group.externalIds.sort()[0] || null,
  }));
}

function missingSpecFields(current: CatalogModel["spec"], summary: ReturnType<typeof summarizeFamily>) {
  const candidates = {
    engine: summary.engine,
    displacement: summary.displacement,
    cylinders: summary.cylinders,
    transmission: summary.transmission,
    drivetrain: summary.drivetrain,
  };
  return Object.fromEntries(Object.entries(candidates).filter(([field, value]) => value && !current?.[field as keyof NonNullable<CatalogModel["spec"]>]));
}

function yearRangeUpdate(model: CatalogModel, sourceStart: number, sourceEnd: number) {
  const productionStartYear = Math.min(model.productionStartYear ?? sourceStart, sourceStart);
  const productionEndYear = Math.max(model.productionEndYear ?? sourceEnd, sourceEnd);
  if (productionStartYear === model.productionStartYear && productionEndYear === model.productionEndYear) return {};
  return { productionStartYear, productionEndYear, years: formatYears(productionStartYear, productionEndYear) };
}

function buildEvidence(summary: ReturnType<typeof summarizeFamily>) {
  const source = summary.representative;
  const fields = [
    ["engineDescription", summary.engine],
    ["displacementLiters", source.displacementLiters?.toString() || null],
    ["cylinders", source.cylinders?.toString() || null],
    ["fuelType", source.fuelType],
    ["vehicleClass", source.vehicleClass],
    ["aspiration", source.aspiration],
    ["drivetrain", source.drivetrain],
    ["transmissionDescription", source.transmission],
  ] as const;
  return fields.filter((entry) => Boolean(entry[1])).map(([fieldName, rawValue]) => ({
    fieldName: String(fieldName),
    sourceType: "GOVERNMENT_DATASET",
    sourceName: EPA_SOURCE_NAME,
    sourceUrl: source.sourceUrl,
    rawValue: String(rawValue),
    confidence: "HIGH",
    notes: `Representative ${source.year} ${source.make} ${source.model} configuration from the official EPA vehicle dataset.`,
  }));
}

function formatEngine(record: EpaVehicleRecord) {
  const parts = [
    record.aspiration === "ELECTRIC" ? "Electric motor" : null,
    record.aspiration === "HYBRID" ? "Hybrid" : null,
    record.displacementLiters ? `${record.displacementLiters.toFixed(1)}L` : null,
    record.aspiration === "TURBOCHARGED" ? "Turbocharged" : record.aspiration === "SUPERCHARGED" ? "Supercharged" : record.aspiration === "TWIN_CHARGED" ? "Twin-charged" : null,
    record.cylinders ? formatCylinders(record.cylinders) : null,
  ].filter(Boolean);
  return [...new Set(parts)].join(" ") || null;
}

function formatCylinders(cylinders: number) {
  if (cylinders === 6 || cylinders === 8 || cylinders === 10 || cylinders === 12) return `V${cylinders}`;
  return `${cylinders}-cylinder`;
}

function normalizeDrivetrain(value: string | null) {
  if (!value) return "UNKNOWN";
  const normalized = value.toLowerCase();
  if (normalized.includes("4-wheel") || normalized.includes("all-wheel")) return "AWD";
  if (normalized.includes("front-wheel")) return "FWD";
  if (normalized.includes("rear-wheel")) return "RWD";
  return "UNKNOWN";
}

function normalizeTransmission(value: string | null) {
  if (!value) return "UNKNOWN";
  const normalized = value.toLowerCase();
  if (normalized.includes("manual") && !normalized.includes("automated")) return "MANUAL";
  if (normalized.includes("automatic") || normalized.includes("auto")) return "AUTOMATIC";
  return "OTHER";
}

function categoryFromClass(value: string | null) {
  if (!value) return null;
  if (/two seater|minicompact|subcompact/i.test(value)) return "Performance / Passenger Car";
  if (/sport utility/i.test(value)) return "SUV";
  if (/pickup/i.test(value)) return "Truck";
  if (/van/i.test(value)) return "Van";
  return "Passenger Car";
}

function bodyStyleFromClass(value: string | null) {
  if (!value) return null;
  if (/two seater/i.test(value)) return "Two-seater";
  if (/station wagon/i.test(value)) return "Wagon";
  if (/sport utility/i.test(value)) return "SUV";
  if (/pickup/i.test(value)) return "Pickup";
  if (/van/i.test(value)) return "Van";
  return null;
}

function completeness(record: EpaVehicleRecord) {
  return [record.cylinders, record.displacementLiters, record.drivetrain, record.transmission, record.engineDescription, record.fuelType, record.vehicleClass].filter(Boolean).length;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueSlug(name: string, models: CatalogModel[]) {
  const base = slugifyTrustedModel(name);
  const existing = new Set(models.map((model) => model.slug));
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function formatYears(start: number, end: number) {
  return start === end ? String(start) : `${start}-${end}`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseOptions(args: string[]): Options {
  const makeArg = args.find((arg) => arg.startsWith("--make="));
  return {
    apply: args.includes("--apply"),
    createModels: !args.includes("--existing-only"),
    makeSlug: makeArg?.split("=")[1] || null,
  };
}

main().catch((error) => {
  console.error("[trusted-models] Failed", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
