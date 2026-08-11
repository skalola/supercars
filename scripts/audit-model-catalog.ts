import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { findModelMetadataCandidates, type ModelAuditRow, type ModelCatalogRecord, type ModelCoverageStatus } from "@/lib/model-catalog";
import { getVehicleHeroImage, isNonVehicleImageUrl } from "@/lib/vehicle-images";

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
  const globalMaintenanceRuleCount = await prisma.maintenanceRule.count({
    where: { modelId: null },
  });

  for (const model of models) {
    const [sourceBackedInventoryRows, compatiblePartCount] = await Promise.all([
      getSourceBackedInventoryRows(model.id),
      countCompatibleParts(model),
    ]);
    const visibleInventoryCount = sourceBackedInventoryRows.filter((listing) => hasCleanDisplayImage(listing)).length;
    const row = buildAuditRow(model, {
      compatiblePartCount,
      globalMaintenanceRuleCount,
      sourceBackedInventoryCount: sourceBackedInventoryRows.length,
      visibleInventoryCount,
    });
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
  console.log(`[model-catalog-audit] Missing compatible parts: ${report.summary.missing.compatibleParts}`);
  console.log(`[model-catalog-audit] Missing visible inventory: ${report.summary.missing.visibleInventory}`);
  console.log(`[model-catalog-audit] Models with visible inventory: ${report.summary.modelPageCoverage.withVisibleInventory}`);
  console.log(`[model-catalog-audit] Models with compatible parts: ${report.summary.modelPageCoverage.withCompatibleParts}`);
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

type SourceBackedInventoryRow = Awaited<ReturnType<typeof getSourceBackedInventoryRows>>[number];

async function getSourceBackedInventoryRows(modelId: string) {
  return prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      modelId,
      vehicleId: { not: null },
      sourceId: { not: null },
      externalListingId: { not: null },
      url: { not: null },
      sellerId: null,
      vehicle: {
        is: {
          inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
        },
      },
      validationStatus: "VALID",
      priceStatus: { not: "PRICE_INVALID" },
      OR: [
        { askingPrice: { gte: 10000 } },
        { price: { gte: 10000 } },
      ],
      NOT: [
        { source: { is: { type: "AUCTION" } } },
        { url: { contains: "bringatrailer.com", mode: "insensitive" } },
        { externalListingId: { contains: "sprint-", mode: "insensitive" } },
        { externalListingId: { contains: "admin-ops", mode: "insensitive" } },
        { externalListingId: { contains: "demo", mode: "insensitive" } },
        { externalListingId: { contains: "test", mode: "insensitive" } },
      ],
    },
    select: {
      imageUrl: true,
      vehicle: {
        select: {
          photos: {
            orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
            select: {
              filePath: true,
              isHero: true,
            },
          },
          images: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              url: true,
              isPrimary: true,
              validationStatus: true,
            },
          },
          model: {
            select: {
              images: {
                select: {
                  url: true,
                  type: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

function hasCleanDisplayImage(listing: SourceBackedInventoryRow) {
  const vehicleHero = getVehicleHeroImage(listing.vehicle);
  if (vehicleHero && vehicleHero !== "/images/placeholder.jpg" && !isNonVehicleImageUrl(vehicleHero)) return true;
  return Boolean(listing.imageUrl && !isNonVehicleImageUrl(listing.imageUrl));
}

async function countCompatibleParts(model: AuditedModel) {
  return prisma.performancePart.count({
    where: {
      status: "ACTIVE",
      OR: [
        { compatibility: { none: {} } },
        {
          compatibility: {
            some: {
              AND: [
                {
                  OR: [
                    { makeId: null },
                    { makeId: model.makeId },
                  ],
                },
                {
                  OR: [
                    { modelId: null },
                    { modelId: model.id },
                  ],
                },
                {
                  OR: [
                    { yearStart: null },
                    { yearStart: { lte: model.productionEndYear ?? model.productionStartYear ?? 9999 } },
                  ],
                },
                {
                  OR: [
                    { yearEnd: null },
                    { yearEnd: { gte: model.productionStartYear ?? model.productionEndYear ?? 0 } },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
  });
}

type ModelPageCoverage = {
  compatiblePartCount: number;
  globalMaintenanceRuleCount: number;
  sourceBackedInventoryCount: number;
  visibleInventoryCount: number;
};

function buildAuditRow(model: AuditedModel, coverage: ModelPageCoverage): ModelAuditRow {
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
  const approvedImageCount = model.images.filter((image) => image.type?.toLowerCase() !== "candidate" && image.reviewStatus !== "NEEDS_REVIEW").length;
  const hasHeroImage = approvedImageCount > 0;
  const hasMarketData = model._count.marketSales > 0 || model._count.marketSnapshots > 0;
  const hasListings = model._count.listings > 0;
  const renderedMaintenanceRuleCount = model.maintenanceRules.length + coverage.globalMaintenanceRuleCount;
  const missing = [
    !hasHeroImage ? "heroImage" : null,
    !model.description ? "description" : null,
    !hasProductionYears ? "productionYears" : null,
    !model.category ? "category" : null,
    !model.bodyStyle ? "bodyStyle" : null,
    !hasSpecs ? "specs" : null,
    model.variants.length === 0 ? "variants" : null,
    renderedMaintenanceRuleCount === 0 ? "maintenanceRules" : null,
    !hasMarketData ? "marketData" : null,
    coverage.compatiblePartCount === 0 ? "compatibleParts" : null,
    coverage.visibleInventoryCount === 0 ? "visibleInventory" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    modelId: model.id,
    make: model.make.name.trim(),
    model: model.name.trim(),
    slug: model.slug,
    status: getCoverageStatus(missing),
    missing,
    approvedImageCount,
    sourceBackedInventoryCount: coverage.sourceBackedInventoryCount,
    visibleInventoryCount: coverage.visibleInventoryCount,
    compatiblePartCount: coverage.compatiblePartCount,
    modelMaintenanceRuleCount: model.maintenanceRules.length,
    renderedMaintenanceRuleCount,
    hasHeroImage,
    hasDescription: Boolean(model.description),
    hasProductionYears,
    hasCategory: Boolean(model.category),
    hasBodyStyle: Boolean(model.bodyStyle),
    hasSpecs,
    hasVariants: model.variants.length > 0,
    hasCompatibleParts: coverage.compatiblePartCount > 0,
    hasVisibleInventory: coverage.visibleInventoryCount > 0,
    hasMaintenanceRules: renderedMaintenanceRuleCount > 0,
    hasMarketData,
    hasListings,
  };
}

function getCoverageStatus(missing: string[]): ModelCoverageStatus {
  const metadataMissing = missing.filter((field) => !["compatibleParts", "visibleInventory"].includes(field));
  if (metadataMissing.length === 0) return "READY";
  const criticalMissing = metadataMissing.filter((field) => ["heroImage", "description", "productionYears", "specs"].includes(field));
  return criticalMissing.length > 0 ? "NEEDS_REVIEW" : "PARTIAL";
}

async function persistAuditStatus(rows: ModelAuditRow[], auditedAt: Date) {
  for (const row of rows) {
    await prisma.model.update({
      where: { id: row.modelId },
      data: {
        metadataStatus: row.status,
        ...(row.sourceCandidate
          ? {
              metadataConfidence: row.sourceCandidate.confidence,
              metadataSource: row.sourceCandidate.sourceName,
              metadataSourceUrl: row.sourceCandidate.sourceUrl || null,
            }
          : {}),
        lastMetadataAuditAt: auditedAt,
      },
    });
  }
}

function buildReport(rows: ModelAuditRow[], auditedAt: Date, options: CliOptions) {
  const missingKeys = ["heroImage", "description", "productionYears", "category", "bodyStyle", "specs", "variants", "maintenanceRules", "marketData", "compatibleParts", "visibleInventory"] as const;
  const byMake = rows.reduce<Record<string, { total: number; ready: number; partial: number; needsReview: number; missingImages: number; missingSpecs: number; missingDescriptions: number; withVisibleInventory: number; withCompatibleParts: number; visibleInventoryListings: number }>>((acc, row) => {
    const current = acc[row.make] || { total: 0, ready: 0, partial: 0, needsReview: 0, missingImages: 0, missingSpecs: 0, missingDescriptions: 0, withVisibleInventory: 0, withCompatibleParts: 0, visibleInventoryListings: 0 };
    current.total += 1;
    if (row.status === "READY") current.ready += 1;
    if (row.status === "PARTIAL") current.partial += 1;
    if (row.status === "NEEDS_REVIEW") current.needsReview += 1;
    if (!row.hasHeroImage) current.missingImages += 1;
    if (!row.hasSpecs) current.missingSpecs += 1;
    if (!row.hasDescription) current.missingDescriptions += 1;
    if (row.hasVisibleInventory) current.withVisibleInventory += 1;
    if (row.hasCompatibleParts) current.withCompatibleParts += 1;
    current.visibleInventoryListings += row.visibleInventoryCount;
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
      modelPageCoverage: {
        withHeroImages: rows.filter((row) => row.hasHeroImage).length,
        withSpecs: rows.filter((row) => row.hasSpecs).length,
        withMaintenanceRules: rows.filter((row) => row.hasMaintenanceRules).length,
        withCompatibleParts: rows.filter((row) => row.hasCompatibleParts).length,
        withVisibleInventory: rows.filter((row) => row.hasVisibleInventory).length,
        totalApprovedImages: rows.reduce((sum, row) => sum + row.approvedImageCount, 0),
        totalCompatibleParts: rows.reduce((sum, row) => sum + row.compatiblePartCount, 0),
        totalVisibleInventoryListings: rows.reduce((sum, row) => sum + row.visibleInventoryCount, 0),
      },
    },
    byMake,
    rows,
  };
}

function renderMarkdownReport(report: ReturnType<typeof buildReport>) {
  const makeRows = Object.entries(report.byMake)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([make, row]) => `| ${make} | ${row.total} | ${row.ready} | ${row.partial} | ${row.needsReview} | ${row.missingImages} | ${row.missingSpecs} | ${row.missingDescriptions} | ${row.withVisibleInventory} | ${row.visibleInventoryListings} | ${row.withCompatibleParts} |`)
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
- Missing compatible parts: ${report.summary.missing.compatibleParts}
- Missing visible inventory: ${report.summary.missing.visibleInventory}

## Model Page Coverage

- Models with hero images: ${report.summary.modelPageCoverage.withHeroImages}
- Models with specs: ${report.summary.modelPageCoverage.withSpecs}
- Models with maintenance rules: ${report.summary.modelPageCoverage.withMaintenanceRules}
- Models with compatible parts: ${report.summary.modelPageCoverage.withCompatibleParts}
- Models with visible inventory: ${report.summary.modelPageCoverage.withVisibleInventory}
- Approved model images: ${report.summary.modelPageCoverage.totalApprovedImages}
- Compatible part matches: ${report.summary.modelPageCoverage.totalCompatibleParts}
- Visible source-backed inventory listings: ${report.summary.modelPageCoverage.totalVisibleInventoryListings}

## By Make

| Make | Total | Ready | Partial | Needs Review | Missing Images | Missing Specs | Missing Descriptions | Models With Inventory | Visible Listings | Models With Parts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
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
