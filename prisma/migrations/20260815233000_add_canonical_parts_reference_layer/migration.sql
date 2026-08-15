ALTER TABLE "PerformancePart"
  ADD COLUMN "partType" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN "identityConfidence" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "identityKey" TEXT,
  ADD COLUMN "catalogPublished" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "offerGapStatus" TEXT NOT NULL DEFAULT 'UNASSESSED';

ALTER TABLE "ModelPartComponent"
  ADD COLUMN "catalogGapStatus" TEXT NOT NULL DEFAULT 'UNASSESSED';

ALTER TABLE "PartCompatibility"
  ADD COLUMN "modelVariantId" TEXT,
  ADD COLUMN "transmission" TEXT,
  ADD COLUMN "drivetrain" TEXT,
  ADD COLUMN "bodyStyle" TEXT,
  ADD COLUMN "aspiration" TEXT,
  ADD COLUMN "electrificationLevel" TEXT,
  ADD COLUMN "fitmentKey" TEXT;

CREATE TABLE "ModelPartApplicability" (
  "id" TEXT NOT NULL,
  "modelPartComponentId" TEXT NOT NULL,
  "modelVariantId" TEXT,
  "ruleKey" TEXT NOT NULL,
  "applicability" TEXT NOT NULL DEFAULT 'APPLICABLE',
  "yearStart" INTEGER,
  "yearEnd" INTEGER,
  "engine" TEXT,
  "transmission" TEXT,
  "drivetrain" TEXT,
  "bodyStyle" TEXT,
  "aspiration" TEXT,
  "electrificationLevel" TEXT,
  "confidence" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "source" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelPartApplicability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogReferenceSource" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "baseUrl" TEXT,
  "accessStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogReferenceSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartCatalogReference" (
  "id" TEXT NOT NULL,
  "referenceKey" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceBrand" TEXT,
  "sourcePartName" TEXT,
  "sourcePartNumber" TEXT,
  "vehicleMakeId" TEXT,
  "vehicleModelId" TEXT,
  "modelVariantId" TEXT,
  "yearStart" INTEGER,
  "yearEnd" INTEGER,
  "sourceCategory" TEXT,
  "sourceComponent" TEXT,
  "confidence" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastCheckedAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartCatalogReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartImage" (
  "id" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "imageType" TEXT NOT NULL DEFAULT 'PRODUCT',
  "sourceName" TEXT,
  "sourceUrl" TEXT,
  "license" TEXT,
  "attribution" TEXT,
  "attributionUrl" TEXT,
  "confidence" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "reviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartPerformanceEvidence" (
  "id" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceName" TEXT,
  "sourceUrl" TEXT,
  "configurationLabel" TEXT,
  "horsepowerGain" INTEGER,
  "torqueGain" INTEGER,
  "confidence" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "notes" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartPerformanceEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartPerformanceConfiguration" (
  "id" TEXT NOT NULL,
  "configurationKey" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "evidenceId" TEXT,
  "modelId" TEXT,
  "modelVariantId" TEXT,
  "yearStart" INTEGER,
  "yearEnd" INTEGER,
  "engine" TEXT,
  "aspiration" TEXT,
  "transmission" TEXT,
  "supportingMods" JSONB,
  "horsepowerGain" INTEGER,
  "torqueGain" INTEGER,
  "confidence" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartPerformanceConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PerformancePart_identityKey_key" ON "PerformancePart"("identityKey");
CREATE INDEX "PerformancePart_catalogPublished_identityConfidence_status_idx" ON "PerformancePart"("catalogPublished", "identityConfidence", "status");
CREATE INDEX "PerformancePart_componentTypeId_partType_catalogPublished_idx" ON "PerformancePart"("componentTypeId", "partType", "catalogPublished");
CREATE INDEX "PerformancePart_offerGapStatus_status_idx" ON "PerformancePart"("offerGapStatus", "status");
CREATE INDEX "ModelPartComponent_catalogGapStatus_active_idx" ON "ModelPartComponent"("catalogGapStatus", "active");
CREATE UNIQUE INDEX "PartCompatibility_fitmentKey_key" ON "PartCompatibility"("fitmentKey");
CREATE INDEX "PartCompatibility_modelVariantId_idx" ON "PartCompatibility"("modelVariantId");
CREATE UNIQUE INDEX "ModelPartApplicability_ruleKey_key" ON "ModelPartApplicability"("ruleKey");
CREATE INDEX "ModelPartApplicability_modelPartComponentId_active_idx" ON "ModelPartApplicability"("modelPartComponentId", "active");
CREATE INDEX "ModelPartApplicability_modelVariantId_active_idx" ON "ModelPartApplicability"("modelVariantId", "active");
CREATE INDEX "ModelPartApplicability_applicability_active_idx" ON "ModelPartApplicability"("applicability", "active");
CREATE UNIQUE INDEX "CatalogReferenceSource_code_key" ON "CatalogReferenceSource"("code");
CREATE INDEX "CatalogReferenceSource_sourceType_active_idx" ON "CatalogReferenceSource"("sourceType", "active");
CREATE INDEX "CatalogReferenceSource_accessStatus_active_idx" ON "CatalogReferenceSource"("accessStatus", "active");
CREATE UNIQUE INDEX "PartCatalogReference_referenceKey_key" ON "PartCatalogReference"("referenceKey");
CREATE INDEX "PartCatalogReference_partId_active_confidence_idx" ON "PartCatalogReference"("partId", "active", "confidence");
CREATE INDEX "PartCatalogReference_sourceId_active_lastCheckedAt_idx" ON "PartCatalogReference"("sourceId", "active", "lastCheckedAt");
CREATE INDEX "PartCatalogReference_vehicleMakeId_vehicleModelId_active_idx" ON "PartCatalogReference"("vehicleMakeId", "vehicleModelId", "active");
CREATE INDEX "PartCatalogReference_sourcePartNumber_idx" ON "PartCatalogReference"("sourcePartNumber");
CREATE INDEX "PartCatalogReference_status_active_idx" ON "PartCatalogReference"("status", "active");
CREATE UNIQUE INDEX "PartImage_partId_url_key" ON "PartImage"("partId", "url");
CREATE INDEX "PartImage_partId_active_displayOrder_idx" ON "PartImage"("partId", "active", "displayOrder");
CREATE INDEX "PartImage_reviewStatus_active_idx" ON "PartImage"("reviewStatus", "active");
CREATE INDEX "PartPerformanceEvidence_partId_active_confidence_idx" ON "PartPerformanceEvidence"("partId", "active", "confidence");
CREATE INDEX "PartPerformanceEvidence_sourceType_active_idx" ON "PartPerformanceEvidence"("sourceType", "active");
CREATE UNIQUE INDEX "PartPerformanceConfiguration_configurationKey_key" ON "PartPerformanceConfiguration"("configurationKey");
CREATE INDEX "PartPerformanceConfiguration_partId_active_confidence_idx" ON "PartPerformanceConfiguration"("partId", "active", "confidence");
CREATE INDEX "PartPerformanceConfiguration_modelId_modelVariantId_active_idx" ON "PartPerformanceConfiguration"("modelId", "modelVariantId", "active");
CREATE INDEX "PartPerformanceConfiguration_evidenceId_idx" ON "PartPerformanceConfiguration"("evidenceId");

ALTER TABLE "PartCompatibility" ADD CONSTRAINT "PartCompatibility_modelVariantId_fkey" FOREIGN KEY ("modelVariantId") REFERENCES "ModelVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelPartApplicability" ADD CONSTRAINT "ModelPartApplicability_modelPartComponentId_fkey" FOREIGN KEY ("modelPartComponentId") REFERENCES "ModelPartComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelPartApplicability" ADD CONSTRAINT "ModelPartApplicability_modelVariantId_fkey" FOREIGN KEY ("modelVariantId") REFERENCES "ModelVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartCatalogReference" ADD CONSTRAINT "PartCatalogReference_partId_fkey" FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartCatalogReference" ADD CONSTRAINT "PartCatalogReference_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CatalogReferenceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartCatalogReference" ADD CONSTRAINT "PartCatalogReference_vehicleMakeId_fkey" FOREIGN KEY ("vehicleMakeId") REFERENCES "Make"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartCatalogReference" ADD CONSTRAINT "PartCatalogReference_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "Model"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartCatalogReference" ADD CONSTRAINT "PartCatalogReference_modelVariantId_fkey" FOREIGN KEY ("modelVariantId") REFERENCES "ModelVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartImage" ADD CONSTRAINT "PartImage_partId_fkey" FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartPerformanceEvidence" ADD CONSTRAINT "PartPerformanceEvidence_partId_fkey" FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartPerformanceConfiguration" ADD CONSTRAINT "PartPerformanceConfiguration_partId_fkey" FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartPerformanceConfiguration" ADD CONSTRAINT "PartPerformanceConfiguration_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "PartPerformanceEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartPerformanceConfiguration" ADD CONSTRAINT "PartPerformanceConfiguration_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartPerformanceConfiguration" ADD CONSTRAINT "PartPerformanceConfiguration_modelVariantId_fkey" FOREIGN KEY ("modelVariantId") REFERENCES "ModelVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
