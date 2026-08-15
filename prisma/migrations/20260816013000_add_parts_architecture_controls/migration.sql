ALTER TABLE "PartBrand"
ADD COLUMN "qualityWeight" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "PreferredPartBrand"
ADD COLUMN "vehicleModelId" TEXT;

ALTER TABLE "MaintenanceRulePart"
ALTER COLUMN "partId" DROP NOT NULL,
ADD COLUMN "componentTypeId" TEXT;

ALTER TABLE "MaintenanceRulePart"
ADD CONSTRAINT "MaintenanceRulePart_componentTypeId_fkey"
FOREIGN KEY ("componentTypeId") REFERENCES "PartComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MaintenanceRulePart_maintenanceRuleId_componentTypeId_key"
ON "MaintenanceRulePart"("maintenanceRuleId", "componentTypeId");
CREATE INDEX "MaintenanceRulePart_componentTypeId_idx" ON "MaintenanceRulePart"("componentTypeId");

ALTER TABLE "PreferredPartBrand"
ADD CONSTRAINT "PreferredPartBrand_vehicleModelId_fkey"
FOREIGN KEY ("vehicleModelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PreferredPartBrand_vehicleModelId_active_priority_idx"
ON "PreferredPartBrand"("vehicleModelId", "active", "priority");

CREATE TABLE "PartApplicabilityOverride" (
  "id" TEXT NOT NULL,
  "vehicleMakeId" TEXT NOT NULL,
  "vehicleModelId" TEXT,
  "partTypeId" TEXT NOT NULL,
  "overrideStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartApplicabilityOverride_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartApplicabilityOverride_vehicleMakeId_fkey" FOREIGN KEY ("vehicleMakeId") REFERENCES "Make"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartApplicabilityOverride_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartApplicabilityOverride_partTypeId_fkey" FOREIGN KEY ("partTypeId") REFERENCES "PartComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartApplicabilityOverride_vehicleMakeId_vehicleModelId_partTypeId_key"
ON "PartApplicabilityOverride"("vehicleMakeId", "vehicleModelId", "partTypeId");
CREATE INDEX "PartApplicabilityOverride_vehicleMakeId_active_idx" ON "PartApplicabilityOverride"("vehicleMakeId", "active");
CREATE INDEX "PartApplicabilityOverride_vehicleModelId_active_idx" ON "PartApplicabilityOverride"("vehicleModelId", "active");
CREATE INDEX "PartApplicabilityOverride_partTypeId_active_idx" ON "PartApplicabilityOverride"("partTypeId", "active");

CREATE TABLE "PartsMarqueConfig" (
  "id" TEXT NOT NULL,
  "makeId" TEXT NOT NULL,
  "partsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "catalogStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
  "defaultMarketplace" TEXT NOT NULL DEFAULT 'EBAY_US',
  "enabledProviders" JSONB,
  "enabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartsMarqueConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartsMarqueConfig_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "Make"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartsMarqueConfig_makeId_key" ON "PartsMarqueConfig"("makeId");
CREATE INDEX "PartsMarqueConfig_partsEnabled_catalogStatus_idx" ON "PartsMarqueConfig"("partsEnabled", "catalogStatus");

INSERT INTO "PartsMarqueConfig" (
  "id", "makeId", "partsEnabled", "catalogStatus", "defaultCurrency", "defaultMarketplace", "enabledProviders", "enabledAt", "createdAt", "updatedAt"
)
SELECT
  'parts-marque-' || make.slug,
  make.id,
  make.slug = 'ferrari',
  CASE WHEN make.slug = 'ferrari' THEN 'REFERENCE_READY' ELSE 'FIXTURE_ONLY' END,
  'USD',
  'EBAY_US',
  '["EBAY"]'::jsonb,
  CASE WHEN make.slug = 'ferrari' THEN CURRENT_TIMESTAMP ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Make" make
WHERE make.slug IN ('ferrari', 'lamborghini', 'mclaren', 'nissan')
ON CONFLICT ("makeId") DO NOTHING;
