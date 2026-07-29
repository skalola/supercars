ALTER TABLE "GarageItem"
ADD COLUMN "priceTrackerAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "listingTrackerAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "priceTrackerBaseline" DOUBLE PRECISION,
ADD COLUMN "lastPriceAlertAt" TIMESTAMP(3),
ADD COLUMN "lastListingAlertAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "GarageItem_modelId_priceTrackerAlertsEnabled_idx"
ON "GarageItem"("modelId", "priceTrackerAlertsEnabled");

CREATE INDEX "GarageItem_modelId_listingTrackerAlertsEnabled_idx"
ON "GarageItem"("modelId", "listingTrackerAlertsEnabled");
