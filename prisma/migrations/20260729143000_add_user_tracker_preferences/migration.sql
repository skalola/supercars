CREATE TABLE "UserTrackerPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingTrackerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "priceTrackerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceTrackerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "eventsTrackerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTrackerPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrackerAlertDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "modelId" TEXT,
    "alertType" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackerAlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTrackerPreference_userId_key" ON "UserTrackerPreference"("userId");
CREATE UNIQUE INDEX "TrackerAlertDelivery_userId_alertType_alertKey_key" ON "TrackerAlertDelivery"("userId", "alertType", "alertKey");
CREATE INDEX "TrackerAlertDelivery_vehicleId_alertType_idx" ON "TrackerAlertDelivery"("vehicleId", "alertType");
CREATE INDEX "TrackerAlertDelivery_modelId_alertType_idx" ON "TrackerAlertDelivery"("modelId", "alertType");

ALTER TABLE "UserTrackerPreference" ADD CONSTRAINT "UserTrackerPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackerAlertDelivery" ADD CONSTRAINT "TrackerAlertDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackerAlertDelivery" ADD CONSTRAINT "TrackerAlertDelivery_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
