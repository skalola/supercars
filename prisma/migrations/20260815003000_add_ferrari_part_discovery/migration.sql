-- Durable product-family identity and richer marketplace offer metadata.
ALTER TABLE "PerformancePart"
ADD COLUMN "normalizedTitle" TEXT,
ADD COLUMN "productFamilyType" TEXT NOT NULL DEFAULT 'CANONICAL';

ALTER TABLE "PartComponentType" ADD COLUMN "aliases" JSONB;

ALTER TABLE "PartOffer"
ADD COLUMN "subtitle" TEXT,
ADD COLUMN "additionalImageUrls" JSONB,
ADD COLUMN "itemLocation" TEXT,
ADD COLUMN "brandName" TEXT,
ADD COLUMN "manufacturerPartNumber" TEXT,
ADD COLUMN "oemPartNumber" TEXT,
ADD COLUMN "compatibilityData" JSONB,
ADD COLUMN "marketplaceCategoryId" TEXT,
ADD COLUMN "classification" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "quantityAvailable" INTEGER;

ALTER TABLE "PartOffer" DROP CONSTRAINT "PartOffer_partId_fkey";
ALTER TABLE "PartOffer" ADD CONSTRAINT "PartOffer_partId_fkey"
FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PartOffer_classification_active_idx" ON "PartOffer"("classification", "active");
CREATE INDEX "PartOffer_manufacturerPartNumber_idx" ON "PartOffer"("manufacturerPartNumber");
CREATE INDEX "PartOffer_oemPartNumber_idx" ON "PartOffer"("oemPartNumber");

CREATE TABLE "PartIdentifier" (
  "id" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "confidence" TEXT NOT NULL DEFAULT 'POSSIBLE',
  "evidence" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartIdentifier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartIdentifier_partId_type_normalizedValue_key"
ON "PartIdentifier"("partId", "type", "normalizedValue");
CREATE INDEX "PartIdentifier_type_normalizedValue_idx" ON "PartIdentifier"("type", "normalizedValue");
CREATE INDEX "PartIdentifier_source_confidence_idx" ON "PartIdentifier"("source", "confidence");
ALTER TABLE "PartIdentifier" ADD CONSTRAINT "PartIdentifier_partId_fkey"
FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-query checkpoints make broad eBay discovery incremental and resumable.
CREATE TABLE "PartDiscoveryQuery" (
  "id" TEXT NOT NULL,
  "modelPartComponentId" TEXT NOT NULL,
  "queryKey" TEXT NOT NULL,
  "queryText" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "listingsExamined" INTEGER NOT NULL DEFAULT 0,
  "listingsAccepted" INTEGER NOT NULL DEFAULT 0,
  "listingsRejected" INTEGER NOT NULL DEFAULT 0,
  "rateLimitEvents" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "refreshAfter" TIMESTAMP(3),
  "lastRateLimitAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartDiscoveryQuery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartDiscoveryQuery_queryKey_key" ON "PartDiscoveryQuery"("queryKey");
CREATE INDEX "PartDiscoveryQuery_modelPartComponentId_status_idx"
ON "PartDiscoveryQuery"("modelPartComponentId", "status");
CREATE INDEX "PartDiscoveryQuery_refreshAfter_status_idx" ON "PartDiscoveryQuery"("refreshAfter", "status");
CREATE INDEX "PartDiscoveryQuery_lastAttemptAt_idx" ON "PartDiscoveryQuery"("lastAttemptAt");
ALTER TABLE "PartDiscoveryQuery" ADD CONSTRAINT "PartDiscoveryQuery_modelPartComponentId_fkey"
FOREIGN KEY ("modelPartComponentId") REFERENCES "ModelPartComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
