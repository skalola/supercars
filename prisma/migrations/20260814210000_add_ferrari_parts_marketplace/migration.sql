-- Extend the durable part record with source-catalog identity.
ALTER TABLE "PerformancePart"
ADD COLUMN "oemPartNumber" TEXT,
ADD COLUMN "canonicalKey" TEXT,
ADD COLUMN "sourceCatalog" TEXT,
ADD COLUMN "sourceCategory" TEXT,
ADD COLUMN "diagramReference" TEXT;

CREATE UNIQUE INDEX "PerformancePart_canonicalKey_key" ON "PerformancePart"("canonicalKey");
CREATE INDEX "PerformancePart_oemPartNumber_idx" ON "PerformancePart"("oemPartNumber");
CREATE INDEX "PerformancePart_sourceCatalog_status_idx" ON "PerformancePart"("sourceCatalog", "status");

-- Marketplace offers are temporary records attached to permanent canonical parts.
CREATE TABLE "PartOffer" (
  "id" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "affiliatePartnerId" TEXT,
  "provider" TEXT NOT NULL,
  "externalItemId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "priceCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "condition" TEXT,
  "sellerName" TEXT,
  "sellerFeedbackPercentage" DOUBLE PRECISION,
  "imageUrl" TEXT,
  "affiliateUrl" TEXT,
  "sourceUrl" TEXT,
  "availability" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "fitmentConfidence" TEXT NOT NULL DEFAULT 'POSSIBLE',
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "affiliateReferenceId" TEXT,
  "itemEndDate" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartOffer_provider_externalItemId_key" ON "PartOffer"("provider", "externalItemId");
CREATE INDEX "PartOffer_partId_provider_active_idx" ON "PartOffer"("partId", "provider", "active");
CREATE INDEX "PartOffer_provider_lastCheckedAt_idx" ON "PartOffer"("provider", "lastCheckedAt");
CREATE INDEX "PartOffer_expiresAt_active_idx" ON "PartOffer"("expiresAt", "active");

ALTER TABLE "PartOffer" ADD CONSTRAINT "PartOffer_partId_fkey"
FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartOffer" ADD CONSTRAINT "PartOffer_affiliatePartnerId_fkey"
FOREIGN KEY ("affiliatePartnerId") REFERENCES "AffiliatePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Source runs make partial catalog coverage and blocked URLs visible to admins.
CREATE TABLE "PartSourceRun" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "runType" TEXT NOT NULL,
  "makeSlug" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "stats" JSONB,
  "failedUrls" JSONB,
  "errorSummary" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PartSourceRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartSourceRun_source_startedAt_idx" ON "PartSourceRun"("source", "startedAt");
CREATE INDEX "PartSourceRun_runType_status_idx" ON "PartSourceRun"("runType", "status");

-- Maintenance recommendations can reference one or more canonical parts.
CREATE TABLE "MaintenanceRulePart" (
  "id" TEXT NOT NULL,
  "maintenanceRuleId" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenanceRulePart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaintenanceRulePart_maintenanceRuleId_partId_key"
ON "MaintenanceRulePart"("maintenanceRuleId", "partId");
CREATE INDEX "MaintenanceRulePart_partId_idx" ON "MaintenanceRulePart"("partId");

ALTER TABLE "MaintenanceRulePart" ADD CONSTRAINT "MaintenanceRulePart_maintenanceRuleId_fkey"
FOREIGN KEY ("maintenanceRuleId") REFERENCES "MaintenanceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceRulePart" ADD CONSTRAINT "MaintenanceRulePart_partId_fkey"
FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attribute outbound clicks to the exact offer without storing marketplace-user data.
ALTER TABLE "PartAffiliateClick"
ADD COLUMN "offerId" TEXT,
ADD COLUMN "provider" TEXT,
ADD COLUMN "externalItemId" TEXT,
ADD COLUMN "affiliateReferenceId" TEXT;

CREATE INDEX "PartAffiliateClick_offerId_createdAt_idx" ON "PartAffiliateClick"("offerId", "createdAt");
ALTER TABLE "PartAffiliateClick" ADD CONSTRAINT "PartAffiliateClick_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "PartOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
