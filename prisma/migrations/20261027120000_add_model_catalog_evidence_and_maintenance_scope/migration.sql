-- Preserve source lineage for canonical model-family decisions without storing bulky raw payloads.
CREATE TABLE "ModelCatalogEvidence" (
    "id" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "externalId" TEXT,
    "makeName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "canonicalFamilyName" TEXT,
    "normalizedFamilyKey" TEXT NOT NULL,
    "productionStartYear" INTEGER,
    "productionEndYear" INTEGER,
    "bodyStyle" TEXT,
    "category" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "reviewStatus" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "payloadHash" TEXT,
    "makeId" TEXT,
    "modelId" TEXT,
    "variantId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModelCatalogEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelCatalogEvidence_evidenceKey_key" ON "ModelCatalogEvidence"("evidenceKey");
CREATE INDEX "ModelCatalogEvidence_makeId_normalizedFamilyKey_idx" ON "ModelCatalogEvidence"("makeId", "normalizedFamilyKey");
CREATE INDEX "ModelCatalogEvidence_modelId_reviewStatus_idx" ON "ModelCatalogEvidence"("modelId", "reviewStatus");
CREATE INDEX "ModelCatalogEvidence_sourceType_reviewStatus_idx" ON "ModelCatalogEvidence"("sourceType", "reviewStatus");

ALTER TABLE "ModelCatalogEvidence" ADD CONSTRAINT "ModelCatalogEvidence_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "Make"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelCatalogEvidence" ADD CONSTRAINT "ModelCatalogEvidence_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelCatalogEvidence" ADD CONSTRAINT "ModelCatalogEvidence_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ModelVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaintenanceRule"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'UNIVERSAL',
  ADD COLUMN "makeId" TEXT,
  ADD COLUMN "variantId" TEXT,
  ADD COLUMN "yearStart" INTEGER,
  ADD COLUMN "yearEnd" INTEGER,
  ADD COLUMN "powertrainType" TEXT,
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "sourceName" TEXT NOT NULL DEFAULT 'SUPERCAR DASH legacy guidance',
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "confidence" TEXT NOT NULL DEFAULT 'LOW',
  ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW';

UPDATE "MaintenanceRule" SET "scope" = CASE WHEN "modelId" IS NULL THEN 'UNIVERSAL' ELSE 'MODEL' END;

CREATE UNIQUE INDEX "MaintenanceRule_sourceKey_key" ON "MaintenanceRule"("sourceKey");
CREATE INDEX "MaintenanceRule_makeId_scope_priority_idx" ON "MaintenanceRule"("makeId", "scope", "priority");
CREATE INDEX "MaintenanceRule_variantId_priority_idx" ON "MaintenanceRule"("variantId", "priority");
CREATE INDEX "MaintenanceRule_reviewStatus_confidence_idx" ON "MaintenanceRule"("reviewStatus", "confidence");

ALTER TABLE "MaintenanceRule" ADD CONSTRAINT "MaintenanceRule_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "Make"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRule" ADD CONSTRAINT "MaintenanceRule_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ModelVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
