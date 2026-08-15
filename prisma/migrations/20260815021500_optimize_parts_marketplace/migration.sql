ALTER TABLE "PartOffer" ADD COLUMN "contentHash" TEXT;

CREATE INDEX "PerformancePart_status_lastCheckedAt_idx"
ON "PerformancePart"("status", "lastCheckedAt");

CREATE INDEX "PartOffer_active_availability_lastSeenAt_idx"
ON "PartOffer"("active", "availability", "lastSeenAt");

CREATE INDEX "PartAffiliateClick_createdAt_idx"
ON "PartAffiliateClick"("createdAt");
