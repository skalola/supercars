-- Permanent vehicle-aware component taxonomy, independent of suppliers.
CREATE TABLE "PartComponentType" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "performanceRelated" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartComponentType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartComponentSearchTemplate" (
  "id" TEXT NOT NULL,
  "componentTypeId" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "brandEnhancer" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartComponentSearchTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModelPartComponent" (
  "id" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "componentTypeId" TEXT NOT NULL,
  "applicability" TEXT NOT NULL DEFAULT 'STANDARD',
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastOfferSearchAt" TIMESTAMP(3),
  "lastOfferSearchStatus" TEXT NOT NULL DEFAULT 'NEVER',
  "lastOfferRejectedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelPartComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartOfferContext" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "modelPartComponentId" TEXT NOT NULL,
  "searchQuery" TEXT NOT NULL,
  "fitmentConfidence" TEXT NOT NULL DEFAULT 'POSSIBLE',
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "matchReasons" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartOfferContext_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PerformancePart" ADD COLUMN "componentTypeId" TEXT;
ALTER TABLE "PartOffer" ALTER COLUMN "partId" DROP NOT NULL;
ALTER TABLE "PartAffiliateClick" ALTER COLUMN "partId" DROP NOT NULL;
ALTER TABLE "PartAffiliateClick" ADD COLUMN "modelPartComponentId" TEXT;

CREATE UNIQUE INDEX "PartComponentType_categoryId_slug_key" ON "PartComponentType"("categoryId", "slug");
CREATE INDEX "PartComponentType_categoryId_active_displayOrder_idx" ON "PartComponentType"("categoryId", "active", "displayOrder");
CREATE UNIQUE INDEX "PartComponentSearchTemplate_componentTypeId_template_key" ON "PartComponentSearchTemplate"("componentTypeId", "template");
CREATE INDEX "PartComponentSearchTemplate_componentTypeId_active_priority_idx" ON "PartComponentSearchTemplate"("componentTypeId", "active", "priority");
CREATE UNIQUE INDEX "ModelPartComponent_modelId_componentTypeId_key" ON "ModelPartComponent"("modelId", "componentTypeId");
CREATE INDEX "ModelPartComponent_modelId_active_idx" ON "ModelPartComponent"("modelId", "active");
CREATE INDEX "ModelPartComponent_componentTypeId_active_idx" ON "ModelPartComponent"("componentTypeId", "active");
CREATE INDEX "ModelPartComponent_lastOfferSearchAt_lastOfferSearchStatus_idx" ON "ModelPartComponent"("lastOfferSearchAt", "lastOfferSearchStatus");
CREATE UNIQUE INDEX "PartOfferContext_offerId_modelPartComponentId_key" ON "PartOfferContext"("offerId", "modelPartComponentId");
CREATE INDEX "PartOfferContext_modelPartComponentId_active_confidenceScore_idx" ON "PartOfferContext"("modelPartComponentId", "active", "confidenceScore");
CREATE INDEX "PartOfferContext_lastCheckedAt_idx" ON "PartOfferContext"("lastCheckedAt");
CREATE INDEX "PerformancePart_componentTypeId_status_idx" ON "PerformancePart"("componentTypeId", "status");
CREATE INDEX "PartAffiliateClick_modelPartComponentId_createdAt_idx" ON "PartAffiliateClick"("modelPartComponentId", "createdAt");

ALTER TABLE "PartComponentType" ADD CONSTRAINT "PartComponentType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PartCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartComponentSearchTemplate" ADD CONSTRAINT "PartComponentSearchTemplate_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "PartComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelPartComponent" ADD CONSTRAINT "ModelPartComponent_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelPartComponent" ADD CONSTRAINT "ModelPartComponent_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "PartComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartOfferContext" ADD CONSTRAINT "PartOfferContext_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PartOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartOfferContext" ADD CONSTRAINT "PartOfferContext_modelPartComponentId_fkey" FOREIGN KEY ("modelPartComponentId") REFERENCES "ModelPartComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformancePart" ADD CONSTRAINT "PerformancePart_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "PartComponentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartAffiliateClick" ADD CONSTRAINT "PartAffiliateClick_modelPartComponentId_fkey" FOREIGN KEY ("modelPartComponentId") REFERENCES "ModelPartComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
