CREATE TABLE "PartProviderCategoryMapping" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "componentTypeId" TEXT NOT NULL,
  "externalCategoryId" TEXT NOT NULL,
  "externalCategoryName" TEXT,
  "taxonomyTreeId" TEXT,
  "taxonomyTreeVersion" TEXT,
  "compatibilitySupported" BOOLEAN NOT NULL DEFAULT false,
  "confidence" TEXT NOT NULL DEFAULT 'DISCOVERED',
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartProviderCategoryMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartProviderVehicleMapping" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "categoryMappingId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "makeValue" TEXT NOT NULL,
  "modelValue" TEXT NOT NULL,
  "trimValue" TEXT,
  "engineValue" TEXT,
  "confidence" TEXT NOT NULL DEFAULT 'YEAR_MAKE_MODEL',
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartProviderVehicleMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartProviderCategoryMapping_providerId_componentTypeId_externalCategoryId_key"
  ON "PartProviderCategoryMapping"("providerId", "componentTypeId", "externalCategoryId");
CREATE INDEX "PartProviderCategoryMapping_componentTypeId_active_expiresAt_idx"
  ON "PartProviderCategoryMapping"("componentTypeId", "active", "expiresAt");
CREATE INDEX "PartProviderCategoryMapping_providerId_active_expiresAt_idx"
  ON "PartProviderCategoryMapping"("providerId", "active", "expiresAt");

CREATE UNIQUE INDEX "PartProviderVehicleMapping_providerId_modelId_categoryMappingId_year_key"
  ON "PartProviderVehicleMapping"("providerId", "modelId", "categoryMappingId", "year");
CREATE INDEX "PartProviderVehicleMapping_modelId_year_active_expiresAt_idx"
  ON "PartProviderVehicleMapping"("modelId", "year", "active", "expiresAt");
CREATE INDEX "PartProviderVehicleMapping_providerId_active_expiresAt_idx"
  ON "PartProviderVehicleMapping"("providerId", "active", "expiresAt");

ALTER TABLE "PartProviderCategoryMapping"
  ADD CONSTRAINT "PartProviderCategoryMapping_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "PartOfferProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartProviderCategoryMapping"
  ADD CONSTRAINT "PartProviderCategoryMapping_componentTypeId_fkey"
  FOREIGN KEY ("componentTypeId") REFERENCES "PartComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartProviderVehicleMapping"
  ADD CONSTRAINT "PartProviderVehicleMapping_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "PartOfferProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartProviderVehicleMapping"
  ADD CONSTRAINT "PartProviderVehicleMapping_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartProviderVehicleMapping"
  ADD CONSTRAINT "PartProviderVehicleMapping_categoryMappingId_fkey"
  FOREIGN KEY ("categoryMappingId") REFERENCES "PartProviderCategoryMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
