CREATE TABLE "MarketModelSummary" (
  "modelId" TEXT NOT NULL,
  "activeListingCount" INTEGER NOT NULL DEFAULT 0,
  "lowestListingPrice" DOUBLE PRECISION,
  "highestListingPrice" DOUBLE PRECISION,
  "averageAskingPrice" DOUBLE PRECISION,
  "medianAskingPrice" DOUBLE PRECISION,
  "totalActiveInventoryValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recentSalesCount" INTEGER NOT NULL DEFAULT 0,
  "averageSalePrice" DOUBLE PRECISION,
  "medianSalePrice" DOUBLE PRECISION,
  "averageSaleMileage" DOUBLE PRECISION,
  "averageSoldPrice" DOUBLE PRECISION,
  "askingVsSoldDifference" DOUBLE PRECISION,
  "askingVsSoldDifferencePct" DOUBLE PRECISION,
  "trendDirection" TEXT,
  "trendChangePercent" DOUBLE PRECISION,
  "trendSnapshotCount" INTEGER NOT NULL DEFAULT 0,
  "lastListingSeenAt" TIMESTAMP(3),
  "lastSaleSeenAt" TIMESTAMP(3),
  "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketModelSummary_pkey" PRIMARY KEY ("modelId")
);

CREATE INDEX "MarketModelSummary_activeListingCount_idx" ON "MarketModelSummary"("activeListingCount");
CREATE INDEX "MarketModelSummary_refreshedAt_idx" ON "MarketModelSummary"("refreshedAt");

ALTER TABLE "MarketModelSummary"
ADD CONSTRAINT "MarketModelSummary_modelId_fkey"
FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
