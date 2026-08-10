CREATE TABLE "PartCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartBrand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "country" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartBrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliatePartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "network" TEXT,
    "websiteUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "commissionLabel" TEXT,
    "trackingTemplate" TEXT,
    "disclosure" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliatePartner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PerformancePart" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "affiliatePartnerId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "partNumber" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "sourceConfidence" TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "retailPriceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "retailerName" TEXT,
    "retailerSku" TEXT,
    "affiliateUrl" TEXT,
    "commissionRateBps" INTEGER,
    "trackingStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastCheckedAt" TIMESTAMP(3),
    "estimatedHpGain" INTEGER,
    "estimatedTorqueGain" INTEGER,
    "gainBasis" TEXT,
    "installComplexity" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformancePart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartCompatibility" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "makeId" TEXT,
    "modelId" TEXT,
    "yearStart" INTEGER,
    "yearEnd" INTEGER,
    "trim" TEXT,
    "engine" TEXT,
    "notes" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartCompatibility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleInstalledPart" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "partId" TEXT,
    "legacyModificationId" TEXT,
    "categoryId" TEXT,
    "userId" TEXT,
    "installStatus" TEXT NOT NULL DEFAULT 'INSTALLED',
    "installedDate" TEXT,
    "notes" TEXT,
    "customName" TEXT,
    "customBrandName" TEXT,
    "hpGainOverride" INTEGER,
    "torqueGainOverride" INTEGER,
    "verificationStatus" TEXT NOT NULL DEFAULT 'OWNER_REPORTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleInstalledPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartAffiliateClick" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "affiliatePartnerId" TEXT,
    "vehicleId" TEXT,
    "vehicleInstalledPartId" TEXT,
    "userId" TEXT,
    "outboundUrl" TEXT NOT NULL,
    "clickRef" TEXT NOT NULL,
    "sourcePath" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartAffiliateClick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartCategory_slug_key" ON "PartCategory"("slug");
CREATE INDEX "PartCategory_active_displayOrder_idx" ON "PartCategory"("active", "displayOrder");

CREATE UNIQUE INDEX "PartBrand_slug_key" ON "PartBrand"("slug");
CREATE INDEX "PartBrand_active_name_idx" ON "PartBrand"("active", "name");

CREATE UNIQUE INDEX "AffiliatePartner_slug_key" ON "AffiliatePartner"("slug");
CREATE INDEX "AffiliatePartner_status_active_idx" ON "AffiliatePartner"("status", "active");

CREATE UNIQUE INDEX "PerformancePart_brandId_slug_key" ON "PerformancePart"("brandId", "slug");
CREATE INDEX "PerformancePart_categoryId_status_idx" ON "PerformancePart"("categoryId", "status");
CREATE INDEX "PerformancePart_brandId_status_idx" ON "PerformancePart"("brandId", "status");
CREATE INDEX "PerformancePart_trackingStatus_idx" ON "PerformancePart"("trackingStatus");

CREATE UNIQUE INDEX "PartCompatibility_scope_key" ON "PartCompatibility"("partId", "makeId", "modelId", "yearStart", "yearEnd", "trim", "engine");
CREATE INDEX "PartCompatibility_makeId_modelId_idx" ON "PartCompatibility"("makeId", "modelId");
CREATE INDEX "PartCompatibility_partId_idx" ON "PartCompatibility"("partId");

CREATE UNIQUE INDEX "VehicleInstalledPart_legacyModificationId_key" ON "VehicleInstalledPart"("legacyModificationId");
CREATE INDEX "VehicleInstalledPart_vehicleId_installStatus_idx" ON "VehicleInstalledPart"("vehicleId", "installStatus");
CREATE INDEX "VehicleInstalledPart_partId_idx" ON "VehicleInstalledPart"("partId");
CREATE INDEX "VehicleInstalledPart_categoryId_idx" ON "VehicleInstalledPart"("categoryId");
CREATE INDEX "VehicleInstalledPart_userId_idx" ON "VehicleInstalledPart"("userId");

CREATE UNIQUE INDEX "PartAffiliateClick_clickRef_key" ON "PartAffiliateClick"("clickRef");
CREATE INDEX "PartAffiliateClick_partId_createdAt_idx" ON "PartAffiliateClick"("partId", "createdAt");
CREATE INDEX "PartAffiliateClick_affiliatePartnerId_createdAt_idx" ON "PartAffiliateClick"("affiliatePartnerId", "createdAt");
CREATE INDEX "PartAffiliateClick_vehicleId_createdAt_idx" ON "PartAffiliateClick"("vehicleId", "createdAt");
CREATE INDEX "PartAffiliateClick_userId_createdAt_idx" ON "PartAffiliateClick"("userId", "createdAt");

ALTER TABLE "PerformancePart" ADD CONSTRAINT "PerformancePart_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PartCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PerformancePart" ADD CONSTRAINT "PerformancePart_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "PartBrand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PerformancePart" ADD CONSTRAINT "PerformancePart_affiliatePartnerId_fkey" FOREIGN KEY ("affiliatePartnerId") REFERENCES "AffiliatePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartCompatibility" ADD CONSTRAINT "PartCompatibility_partId_fkey" FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartCompatibility" ADD CONSTRAINT "PartCompatibility_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "Make"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartCompatibility" ADD CONSTRAINT "PartCompatibility_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VehicleInstalledPart" ADD CONSTRAINT "VehicleInstalledPart_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleInstalledPart" ADD CONSTRAINT "VehicleInstalledPart_partId_fkey" FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleInstalledPart" ADD CONSTRAINT "VehicleInstalledPart_legacyModificationId_fkey" FOREIGN KEY ("legacyModificationId") REFERENCES "VehicleModification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleInstalledPart" ADD CONSTRAINT "VehicleInstalledPart_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PartCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleInstalledPart" ADD CONSTRAINT "VehicleInstalledPart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartAffiliateClick" ADD CONSTRAINT "PartAffiliateClick_partId_fkey" FOREIGN KEY ("partId") REFERENCES "PerformancePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartAffiliateClick" ADD CONSTRAINT "PartAffiliateClick_affiliatePartnerId_fkey" FOREIGN KEY ("affiliatePartnerId") REFERENCES "AffiliatePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartAffiliateClick" ADD CONSTRAINT "PartAffiliateClick_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartAffiliateClick" ADD CONSTRAINT "PartAffiliateClick_vehicleInstalledPartId_fkey" FOREIGN KEY ("vehicleInstalledPartId") REFERENCES "VehicleInstalledPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartAffiliateClick" ADD CONSTRAINT "PartAffiliateClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
