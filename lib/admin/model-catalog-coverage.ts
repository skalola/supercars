import { prisma } from "@/lib/prisma";

export type ModelCatalogCoverageRow = {
  makeId: string;
  makeName: string;
  makeSlug: string;
  modelCount: number;
  imageCount: number;
  specCount: number;
  completeCoreSpecCount: number;
  descriptionCount: number;
  variantCount: number;
  verifiedEvidenceCount: number;
  reviewEvidenceCount: number;
  specificMaintenanceCount: number;
};

type NumericCoverageRow = Omit<ModelCatalogCoverageRow, "modelCount" | "imageCount" | "specCount" | "completeCoreSpecCount" | "descriptionCount" | "variantCount" | "verifiedEvidenceCount" | "reviewEvidenceCount" | "specificMaintenanceCount"> & {
  modelCount: bigint;
  imageCount: bigint;
  specCount: bigint;
  completeCoreSpecCount: bigint;
  descriptionCount: bigint;
  variantCount: bigint;
  verifiedEvidenceCount: bigint;
  reviewEvidenceCount: bigint;
  specificMaintenanceCount: bigint;
};

export async function getModelCatalogCoverage(): Promise<ModelCatalogCoverageRow[]> {
  const rows = await prisma.$queryRaw<NumericCoverageRow[]>`
    WITH model_rollup AS (
      SELECT
        m."makeId",
        COUNT(*) AS "modelCount",
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "ModelImage" mi WHERE mi."modelId" = m."id" AND mi."reviewStatus" NOT IN ('NEEDS_REVIEW', 'REJECTED'))) AS "imageCount",
        COUNT(*) FILTER (WHERE ms."id" IS NOT NULL) AS "specCount",
        COUNT(*) FILTER (WHERE ms."engine" IS NOT NULL AND ms."horsepower" IS NOT NULL AND ms."torque" IS NOT NULL AND ms."transmission" IS NOT NULL AND ms."drivetrain" IS NOT NULL) AS "completeCoreSpecCount",
        COUNT(*) FILTER (WHERE m."description" IS NOT NULL AND LENGTH(TRIM(m."description")) > 40) AS "descriptionCount"
      FROM "Model" m
      LEFT JOIN "ModelSpec" ms ON ms."modelId" = m."id"
      GROUP BY m."makeId"
    ), variant_rollup AS (
      SELECT m."makeId", COUNT(mv."id") AS "variantCount" FROM "ModelVariant" mv JOIN "Model" m ON m."id" = mv."modelId" GROUP BY m."makeId"
    ), evidence_rollup AS (
      SELECT "makeId",
        COUNT(*) FILTER (WHERE "reviewStatus" = 'SOURCE_VERIFIED') AS "verifiedEvidenceCount",
        COUNT(*) FILTER (WHERE "reviewStatus" = 'NEEDS_REVIEW') AS "reviewEvidenceCount"
      FROM "ModelCatalogEvidence" WHERE "makeId" IS NOT NULL GROUP BY "makeId"
    ), maintenance_rollup AS (
      SELECT COALESCE(mr."makeId", m."makeId") AS "makeId", COUNT(*) AS "specificMaintenanceCount"
      FROM "MaintenanceRule" mr LEFT JOIN "Model" m ON m."id" = mr."modelId"
      WHERE mr."scope" IN ('MAKE', 'POWERTRAIN', 'MODEL', 'VARIANT') AND mr."reviewStatus" != 'REJECTED'
      GROUP BY COALESCE(mr."makeId", m."makeId")
    )
    SELECT
      mk."id" AS "makeId",
      mk."name" AS "makeName",
      mk."slug" AS "makeSlug",
      COALESCE(model_rollup."modelCount", 0) AS "modelCount",
      COALESCE(model_rollup."imageCount", 0) AS "imageCount",
      COALESCE(model_rollup."specCount", 0) AS "specCount",
      COALESCE(model_rollup."completeCoreSpecCount", 0) AS "completeCoreSpecCount",
      COALESCE(model_rollup."descriptionCount", 0) AS "descriptionCount",
      COALESCE(variant_rollup."variantCount", 0) AS "variantCount",
      COALESCE(evidence_rollup."verifiedEvidenceCount", 0) AS "verifiedEvidenceCount",
      COALESCE(evidence_rollup."reviewEvidenceCount", 0) AS "reviewEvidenceCount",
      COALESCE(maintenance_rollup."specificMaintenanceCount", 0) AS "specificMaintenanceCount"
    FROM "Make" mk
    LEFT JOIN model_rollup ON model_rollup."makeId" = mk."id"
    LEFT JOIN variant_rollup ON variant_rollup."makeId" = mk."id"
    LEFT JOIN evidence_rollup ON evidence_rollup."makeId" = mk."id"
    LEFT JOIN maintenance_rollup ON maintenance_rollup."makeId" = mk."id"
    ORDER BY mk."name" ASC
  `;
  return rows.map((row) => ({
    ...row,
    modelCount: Number(row.modelCount), imageCount: Number(row.imageCount), specCount: Number(row.specCount),
    completeCoreSpecCount: Number(row.completeCoreSpecCount), descriptionCount: Number(row.descriptionCount),
    variantCount: Number(row.variantCount), verifiedEvidenceCount: Number(row.verifiedEvidenceCount),
    reviewEvidenceCount: Number(row.reviewEvidenceCount), specificMaintenanceCount: Number(row.specificMaintenanceCount),
  }));
}
