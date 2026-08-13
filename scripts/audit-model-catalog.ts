import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { findModelMetadataCandidates, type ModelAuditRow, type ModelCatalogRecord, type ModelCoverageStatus } from "@/lib/model-catalog";

const prisma = new PrismaClient();

type CliOptions = {
  sourceLimit: number;
  write: boolean;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const auditedAt = new Date();
  const models = await getCatalogAuditRows();
  const rows: ModelAuditRow[] = [];

  for (const model of models) {
    const row = buildAuditRow(model);
    const sourceIndex = rows.length;

    if (options.sourceLimit > sourceIndex && row.status !== "READY") {
      const record: ModelCatalogRecord = {
        modelId: model.id,
        makeName: model.makeName,
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

type CatalogAuditRow = {
  id: string;
  name: string;
  slug: string;
  years: string | null;
  productionStartYear: number | null;
  productionEndYear: number | null;
  makeName: string;
  hasDescription: boolean;
  hasProductionYears: boolean;
  hasCategory: boolean;
  hasBodyStyle: boolean;
  hasSpecs: boolean;
  approvedImageCount: number;
  variantCount: number;
  modelMaintenanceRuleCount: number;
  renderedMaintenanceRuleCount: number;
  marketDataCount: number;
  listingCount: number;
  sourceBackedInventoryCount: number;
  visibleInventoryCount: number;
  compatiblePartCount: number;
};

async function getCatalogAuditRows() {
  return prisma.$queryRaw<CatalogAuditRow[]>`
    WITH global_rules AS (
      SELECT COUNT(*)::int AS count FROM "MaintenanceRule" WHERE "modelId" IS NULL
    ),
    image_counts AS (
      SELECT "modelId", COUNT(*)::int AS count
      FROM "ModelImage"
      WHERE "reviewStatus" <> 'NEEDS_REVIEW'
        AND (type IS NULL OR LOWER(type) <> 'candidate')
      GROUP BY "modelId"
    ),
    variant_counts AS (
      SELECT "modelId", COUNT(*)::int AS count FROM "ModelVariant" GROUP BY "modelId"
    ),
    model_rule_counts AS (
      SELECT "modelId", COUNT(*)::int AS count
      FROM "MaintenanceRule" WHERE "modelId" IS NOT NULL GROUP BY "modelId"
    ),
    market_counts AS (
      SELECT "modelId", SUM(count)::int AS count
      FROM (
        SELECT "modelId", COUNT(*)::int AS count FROM "MarketSale" GROUP BY "modelId"
        UNION ALL
        SELECT "modelId", COUNT(*)::int AS count FROM "MarketSnapshot" GROUP BY "modelId"
      ) market_rows
      GROUP BY "modelId"
    ),
    listing_counts AS (
      SELECT "modelId", COUNT(*)::int AS count FROM "Listing" GROUP BY "modelId"
    ),
    inventory_candidates AS (
      SELECT
        listing."modelId",
        listing."imageUrl" AS listing_image_url,
        (
          SELECT photo."filePath" FROM "VehiclePhoto" photo
          WHERE photo."vehicleId" = vehicle.id
          ORDER BY photo."isHero" DESC, photo."displayOrder" ASC, photo."createdAt" ASC
          LIMIT 1
        ) AS photo_url,
        (
          SELECT image.url FROM "VehicleImage" image
          WHERE image."vehicleId" = vehicle.id
            AND image."validationStatus" NOT IN ('IMAGE_UNVERIFIED', 'IMAGE_MISMATCH')
          ORDER BY image."isPrimary" DESC, image."createdAt" ASC
          LIMIT 1
        ) AS vehicle_image_url,
        (
          SELECT image.url FROM "ModelImage" image
          WHERE image."modelId" = vehicle."modelId"
          ORDER BY image.type ASC, image."createdAt" ASC
          LIMIT 1
        ) AS model_image_url
      FROM "Listing" listing
      INNER JOIN "Vehicle" vehicle ON vehicle.id = listing."vehicleId"
      INNER JOIN "MarketSource" source ON source.id = listing."sourceId"
      WHERE listing.status = 'ACTIVE'
        AND listing."externalListingId" IS NOT NULL
        AND listing.url IS NOT NULL
        AND listing."sellerId" IS NULL
        AND vehicle."inventoryStatus" IN ('ACTIVE', 'VALID', 'WARNING')
        AND listing."validationStatus" = 'VALID'
        AND listing."priceStatus" IS DISTINCT FROM 'PRICE_INVALID'
        AND (listing."askingPrice" >= 10000 OR listing.price >= 10000)
        AND source.type <> 'AUCTION'
        AND listing.url NOT ILIKE '%bringatrailer.com%'
        AND listing."externalListingId" NOT ILIKE '%sprint-%'
        AND listing."externalListingId" NOT ILIKE '%admin-ops%'
        AND listing."externalListingId" NOT ILIKE '%demo%'
        AND listing."externalListingId" NOT ILIKE '%test%'
    ),
    inventory_coverage AS (
      SELECT
        "modelId",
        COUNT(*)::int AS "sourceBackedInventoryCount",
        COUNT(*) FILTER (WHERE
          (photo_url IS NOT NULL AND photo_url !~* 'placeholder|logo|icon|favicon|spinner|loading|avatar|profile|badge|sprite|transparent|blank|noimage|comingsoon|autocheck|carfax|e6-static-thumber') OR
          (vehicle_image_url IS NOT NULL AND vehicle_image_url !~* 'placeholder|logo|icon|favicon|spinner|loading|avatar|profile|badge|sprite|transparent|blank|noimage|comingsoon|autocheck|carfax|e6-static-thumber') OR
          (model_image_url IS NOT NULL AND model_image_url !~* 'placeholder|logo|icon|favicon|spinner|loading|avatar|profile|badge|sprite|transparent|blank|noimage|comingsoon|autocheck|carfax|e6-static-thumber') OR
          (listing_image_url IS NOT NULL AND listing_image_url !~* 'placeholder|logo|icon|favicon|spinner|loading|avatar|profile|badge|sprite|transparent|blank|noimage|comingsoon|autocheck|carfax|e6-static-thumber')
        )::int AS "visibleInventoryCount"
      FROM inventory_candidates
      GROUP BY "modelId"
    )
    SELECT
      model.id,
      model.name,
      model.slug,
      model.years,
      model."productionStartYear",
      model."productionEndYear",
      make.name AS "makeName",
      (model.description IS NOT NULL AND BTRIM(model.description) <> '') AS "hasDescription",
      (model.years IS NOT NULL OR model."productionStartYear" IS NOT NULL OR model."productionEndYear" IS NOT NULL) AS "hasProductionYears",
      (model.category IS NOT NULL AND BTRIM(model.category) <> '') AS "hasCategory",
      (model."bodyStyle" IS NOT NULL AND BTRIM(model."bodyStyle") <> '') AS "hasBodyStyle",
      (spec.id IS NOT NULL AND CONCAT_WS('', spec.engine, spec.displacement, spec.cylinders,
        spec.horsepower, spec.torque, spec.transmission, spec.drivetrain, spec."topSpeed",
        spec."zeroToSixty", spec.weight) <> '') AS "hasSpecs",
      COALESCE(image_counts.count, 0)::int AS "approvedImageCount",
      COALESCE(variant_counts.count, 0)::int AS "variantCount",
      COALESCE(model_rule_counts.count, 0)::int AS "modelMaintenanceRuleCount",
      (COALESCE(model_rule_counts.count, 0) + global_rules.count)::int AS "renderedMaintenanceRuleCount",
      COALESCE(market_counts.count, 0)::int AS "marketDataCount",
      COALESCE(listing_counts.count, 0)::int AS "listingCount",
      COALESCE(inventory."sourceBackedInventoryCount", 0)::int AS "sourceBackedInventoryCount",
      COALESCE(inventory."visibleInventoryCount", 0)::int AS "visibleInventoryCount",
      (
        SELECT COUNT(*)::int
        FROM "PerformancePart" part
        WHERE part.status = 'ACTIVE'
          AND (
            NOT EXISTS (SELECT 1 FROM "PartCompatibility" compatibility WHERE compatibility."partId" = part.id)
            OR EXISTS (
              SELECT 1 FROM "PartCompatibility" compatibility
              WHERE compatibility."partId" = part.id
                AND (compatibility."makeId" IS NULL OR compatibility."makeId" = model."makeId")
                AND (compatibility."modelId" IS NULL OR compatibility."modelId" = model.id)
                AND (compatibility."yearStart" IS NULL OR compatibility."yearStart" <= COALESCE(model."productionEndYear", model."productionStartYear", 9999))
                AND (compatibility."yearEnd" IS NULL OR compatibility."yearEnd" >= COALESCE(model."productionStartYear", model."productionEndYear", 0))
            )
          )
      ) AS "compatiblePartCount"
    FROM "Model" model
    INNER JOIN "Make" make ON make.id = model."makeId"
    LEFT JOIN "ModelSpec" spec ON spec."modelId" = model.id
    LEFT JOIN image_counts ON image_counts."modelId" = model.id
    LEFT JOIN variant_counts ON variant_counts."modelId" = model.id
    LEFT JOIN model_rule_counts ON model_rule_counts."modelId" = model.id
    LEFT JOIN market_counts ON market_counts."modelId" = model.id
    LEFT JOIN listing_counts ON listing_counts."modelId" = model.id
    LEFT JOIN inventory_coverage inventory ON inventory."modelId" = model.id
    CROSS JOIN global_rules
    ORDER BY make.name ASC, model.name ASC
  `;
}

function buildAuditRow(model: CatalogAuditRow): ModelAuditRow {
  const hasHeroImage = model.approvedImageCount > 0;
  const hasMarketData = model.marketDataCount > 0;
  const hasListings = model.listingCount > 0;
  const missing = [
    !hasHeroImage ? "heroImage" : null,
    !model.hasDescription ? "description" : null,
    !model.hasProductionYears ? "productionYears" : null,
    !model.hasCategory ? "category" : null,
    !model.hasBodyStyle ? "bodyStyle" : null,
    !model.hasSpecs ? "specs" : null,
    model.variantCount === 0 ? "variants" : null,
    model.renderedMaintenanceRuleCount === 0 ? "maintenanceRules" : null,
    !hasMarketData ? "marketData" : null,
    model.compatiblePartCount === 0 ? "compatibleParts" : null,
    model.visibleInventoryCount === 0 ? "visibleInventory" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    modelId: model.id,
    make: model.makeName.trim(),
    model: model.name.trim(),
    slug: model.slug,
    status: getCoverageStatus(missing),
    missing,
    approvedImageCount: model.approvedImageCount,
    sourceBackedInventoryCount: model.sourceBackedInventoryCount,
    visibleInventoryCount: model.visibleInventoryCount,
    compatiblePartCount: model.compatiblePartCount,
    modelMaintenanceRuleCount: model.modelMaintenanceRuleCount,
    renderedMaintenanceRuleCount: model.renderedMaintenanceRuleCount,
    hasHeroImage,
    hasDescription: model.hasDescription,
    hasProductionYears: model.hasProductionYears,
    hasCategory: model.hasCategory,
    hasBodyStyle: model.hasBodyStyle,
    hasSpecs: model.hasSpecs,
    hasVariants: model.variantCount > 0,
    hasCompatibleParts: model.compatiblePartCount > 0,
    hasVisibleInventory: model.visibleInventoryCount > 0,
    hasMaintenanceRules: model.renderedMaintenanceRuleCount > 0,
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
  const statuses: ModelCoverageStatus[] = ["READY", "PARTIAL", "NEEDS_REVIEW"];
  const groupedUpdates = statuses.flatMap((status) => {
    const ids = rows
      .filter((row) => row.status === status && !row.sourceCandidate)
      .map((row) => row.modelId);
    return ids.length > 0
      ? [prisma.model.updateMany({
          where: { id: { in: ids } },
          data: { metadataStatus: status, lastMetadataAuditAt: auditedAt },
        })]
      : [];
  });
  const candidateUpdates = rows.flatMap((row) => row.sourceCandidate
    ? [prisma.model.update({
        where: { id: row.modelId },
        data: {
          metadataStatus: row.status,
          metadataConfidence: row.sourceCandidate.confidence,
          metadataSource: row.sourceCandidate.sourceName,
          metadataSourceUrl: row.sourceCandidate.sourceUrl || null,
          lastMetadataAuditAt: auditedAt,
        },
      })]
    : []
  );

  await prisma.$transaction([...groupedUpdates, ...candidateUpdates]);
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
