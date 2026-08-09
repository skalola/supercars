import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { findModelMetadataCandidates, type ModelAuditRow, type ModelCatalogRecord, type ModelCoverageStatus } from "@/lib/model-catalog";

const prisma = new PrismaClient();

type CliOptions = {
  sourceLimit: number;
  write: boolean;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const models = await prisma.model.findMany({
    include: {
      make: true,
      spec: true,
      images: true,
      variants: { select: { id: true } },
      maintenanceRules: { select: { id: true } },
      _count: {
        select: {
          marketSales: true,
          marketSnapshots: true,
          listings: true,
        },
      },
    },
    orderBy: [
      { make: { name: "asc" } },
      { name: "asc" },
    ],
  });

  const rows: ModelAuditRow[] = [];
  const auditedAt = new Date();

  for (const model of models) {
    const row = buildAuditRow(model);
    const sourceIndex = rows.length;

    if (options.sourceLimit > sourceIndex && row.status !== "READY") {
      const record: ModelCatalogRecord = {
        modelId: model.id,
        makeName: model.make.name,
        modelName: model.name,
        slug: model.slug,
        years: model.years,
        productionStartYear: model.productionStartYear,
        productionEndYear: model.productionEndYear,
      };
      const candidates = await findModelMetadataCandidates(record);
      row.sourceCandidate = candidates[0] || null;
    }

    rows.push(row);
  }

  if (options.write) {
    await persistAuditStatus(rows, auditedAt);
  }

  const report = buildReport(rows, auditedAt, options);
  const outputDir = path.join(process.cwd(), "reports", "model-catalog");
  await mkdir(outputDir, { recursive: true });
  const stamp = auditedAt.toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `model-catalog-audit-${stamp}.json`);
  const markdownPath = path.join(outputDir, `model-catalog-audit-${stamp}.md`);

  await Promise.all([
    writeFile(jsonPath, JSON.stringify(report, null, 2)),
    writeFile(markdownPath, renderMarkdownReport(report)),
  ]);

  console.log(`[model-catalog-audit] Models audited: ${report.summary.totalModels}`);
  console.log(`[model-catalog-audit] Ready: ${report.summary.ready}`);
  console.log(`[model-catalog-audit] Partial: ${report.summary.partial}`);
  console.log(`[model-catalog-audit] Needs review: ${report.summary.needsReview}`);
  console.log(`[model-catalog-audit] Missing images: ${report.summary.missing.heroImage}`);
  console.log(`[model-catalog-audit] Missing specs: ${report.summary.missing.specs}`);
  console.log(`[model-catalog-audit] Missing descriptions: ${report.summary.missing.description}`);
  console.log(`[model-catalog-audit] JSON report: ${jsonPath}`);
  console.log(`[model-catalog-audit] Markdown report: ${markdownPath}`);
}

type AuditedModel = Prisma.ModelGetPayload<{
  include: {
    make: true;
    spec: true;
    images: true;
    variants: { select: { id: true } };
    maintenanceRules: { select: { id: true } };
    _count: {
      select: {
        marketSales: true;
        marketSnapshots: true;
        listings: true;
      };
    };
  };
}>;

function buildAuditRow(model: AuditedModel): ModelAuditRow {
  const hasSpecs = Boolean(
    model.spec &&
      [
        model.spec.engine,
        model.spec.displacement,
        model.spec.cylinders,
        model.spec.horsepower,
        model.spec.torque,
        model.spec.transmission,
        model.spec.drivetrain,
        model.spec.topSpeed,
        model.spec.zeroToSixty,
        model.spec.weight,
      ].some((value) => typeof value === "string" && value.trim().length > 0),
  );
  const hasProductionYears = Boolean(model.years || model.productionStartYear || model.productionEndYear);
  const hasHeroImage = model.images.length > 0;
  const hasMarketData = model._count.marketSales > 0 || model._count.marketSnapshots > 0;
  const hasListings = model._count.listings > 0;
  const missing = [
    !hasHeroImage ? "heroImage" : null,
    !model.description ? "description" : null,
    !hasProductionYears ? "productionYears" : null,
    !model.category ? "category" : null,
    !model.bodyStyle ? "bodyStyle" : null,
    !hasSpecs ? "specs" : null,
    model.variants.length === 0 ? "variants" : null,
    model.maintenanceRules.length === 0 ? "maintenanceRules" : null,
    !hasMarketData ? "marketData" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    modelId: model.id,
    make: model.make.name.trim(),
    model: model.name.trim(),
    slug: model.slug,
    status: getCoverageStatus(missing),
    missing,
    hasHeroImage,
    hasDescription: Boolean(model.description),
    hasProductionYears,
    hasCategory: Boolean(model.category),
    hasBodyStyle: Boolean(model.bodyStyle),
    hasSpecs,
    hasVariants: model.variants.length > 0,
    hasMaintenanceRules: model.maintenanceRules.length > 0,
    hasMarketData,
    hasListings,
  };
}

function getCoverageStatus(missing: string[]): ModelCoverageStatus {
  if (missing.length === 0) return "READY";
  const criticalMissing = missing.filter((field) => ["heroImage", "description", "productionYears", "specs"].includes(field));
  return criticalMissing.length > 0 ? "NEEDS_REVIEW" : "PARTIAL";
}

async function persistAuditStatus(rows: ModelAuditRow[], auditedAt: Date) {
  for (const row of rows) {
    await prisma.model.update({
      where: { id: row.modelId },
      data: {
        metadataStatus: row.status,
        metadataConfidence: row.sourceCandidate?.confidence ?? null,
        metadataSource: row.sourceCandidate?.sourceName ?? null,
        metadataSourceUrl: row.sourceCandidate?.sourceUrl || null,
        lastMetadataAuditAt: auditedAt,
      },
    });
  }
}

function buildReport(rows: ModelAuditRow[], auditedAt: Date, options: CliOptions) {
  const missingKeys = ["heroImage", "description", "productionYears", "category", "bodyStyle", "specs", "variants", "maintenanceRules", "marketData"] as const;
  const byMake = rows.reduce<Record<string, { total: number; ready: number; partial: number; needsReview: number; missingImages: number; missingSpecs: number; missingDescriptions: number }>>((acc, row) => {
    const current = acc[row.make] || { total: 0, ready: 0, partial: 0, needsReview: 0, missingImages: 0, missingSpecs: 0, missingDescriptions: 0 };
    current.total += 1;
    if (row.status === "READY") current.ready += 1;
    if (row.status === "PARTIAL") current.partial += 1;
    if (row.status === "NEEDS_REVIEW") current.needsReview += 1;
    if (!row.hasHeroImage) current.missingImages += 1;
    if (!row.hasSpecs) current.missingSpecs += 1;
    if (!row.hasDescription) current.missingDescriptions += 1;
    acc[row.make] = current;
    return acc;
  }, {});

  return {
    generatedAt: auditedAt.toISOString(),
    options,
    summary: {
      totalModels: rows.length,
      ready: rows.filter((row) => row.status === "READY").length,
      partial: rows.filter((row) => row.status === "PARTIAL").length,
      needsReview: rows.filter((row) => row.status === "NEEDS_REVIEW").length,
      missing: Object.fromEntries(missingKeys.map((key) => [key, rows.filter((row) => row.missing.includes(key)).length])),
    },
    byMake,
    rows,
  };
}

function renderMarkdownReport(report: ReturnType<typeof buildReport>) {
  const makeRows = Object.entries(report.byMake)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([make, row]) => `| ${make} | ${row.total} | ${row.ready} | ${row.partial} | ${row.needsReview} | ${row.missingImages} | ${row.missingSpecs} | ${row.missingDescriptions} |`)
    .join("\n");

  const needsReviewRows = report.rows
    .filter((row) => row.status === "NEEDS_REVIEW")
    .slice(0, 80)
    .map((row) => `| ${row.make} | ${row.model} | ${row.missing.join(", ")} | ${row.sourceCandidate?.title || ""} | ${row.sourceCandidate?.confidence ?? ""} |`)
    .join("\n");

  return `# Model Catalog Audit

Generated: ${report.generatedAt}

## Summary

- Total models: ${report.summary.totalModels}
- Ready: ${report.summary.ready}
- Partial: ${report.summary.partial}
- Needs review: ${report.summary.needsReview}
- Missing hero images: ${report.summary.missing.heroImage}
- Missing descriptions: ${report.summary.missing.description}
- Missing specs: ${report.summary.missing.specs}

## By Make

| Make | Total | Ready | Partial | Needs Review | Missing Images | Missing Specs | Missing Descriptions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${makeRows}

## First 80 Needs Review

| Make | Model | Missing | Source Candidate | Confidence |
| --- | --- | --- | --- | ---: |
${needsReviewRows || "| None | None | None | None |  |"}
`;
}

function parseOptions(args: string[]): CliOptions {
  const sourceLimitArg = args.find((arg) => arg.startsWith("--source-limit="));
  return {
    sourceLimit: sourceLimitArg ? Math.max(0, Number(sourceLimitArg.split("=")[1]) || 0) : 0,
    write: !args.includes("--no-write"),
  };
}

main()
  .catch((error) => {
    console.error("[model-catalog-audit] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
