-- CreateTable
CREATE TABLE "VinDiscovery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vin" TEXT NOT NULL,
    "vehicleId" TEXT,
    "firstDiscovered" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VinDiscovery_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VinDiscoverySource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discoveryId" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceName" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "url" TEXT,
    "externalListingId" TEXT,
    "firstDiscovered" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VinDiscoverySource_discoveryId_fkey" FOREIGN KEY ("discoveryId") REFERENCES "VinDiscovery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VinDiscoverySource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MarketSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VinDiscovery_vin_key" ON "VinDiscovery"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "VinDiscovery_vehicleId_key" ON "VinDiscovery"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "VinDiscoverySource_discoveryId_sourceKey_key" ON "VinDiscoverySource"("discoveryId", "sourceKey");

-- CreateIndex
CREATE INDEX "VinDiscoverySource_sourceName_active_idx" ON "VinDiscoverySource"("sourceName", "active");
