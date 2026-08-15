ALTER TABLE "PartBrand"
ADD COLUMN "brandType" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN "description" TEXT;

CREATE TABLE "PartOfferProvider" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "providerType" TEXT NOT NULL,
  "adapterKey" TEXT,
  "websiteUrl" TEXT,
  "affiliatePartnerId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartOfferProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PreferredPartBrand" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "vehicleMakeId" TEXT NOT NULL,
  "partBrandId" TEXT NOT NULL,
  "componentCategoryId" TEXT,
  "componentTypeId" TEXT,
  "offerProviderId" TEXT,
  "relationshipType" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "officialCatalogUrl" TEXT,
  "affiliateEnabled" BOOLEAN NOT NULL DEFAULT false,
  "affiliateStatus" TEXT NOT NULL DEFAULT 'NOT_CONTACTED',
  "trackingConfigName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreferredPartBrand_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PartOffer" ADD COLUMN "providerId" TEXT;

CREATE UNIQUE INDEX "PartOfferProvider_code_key" ON "PartOfferProvider"("code");
CREATE INDEX "PartOfferProvider_providerType_active_idx" ON "PartOfferProvider"("providerType", "active");
CREATE INDEX "PartOfferProvider_affiliatePartnerId_idx" ON "PartOfferProvider"("affiliatePartnerId");
CREATE UNIQUE INDEX "PreferredPartBrand_scopeKey_key" ON "PreferredPartBrand"("scopeKey");
CREATE INDEX "PreferredPartBrand_vehicleMakeId_active_priority_idx" ON "PreferredPartBrand"("vehicleMakeId", "active", "priority");
CREATE INDEX "PreferredPartBrand_vehicleMakeId_componentCategoryId_active_priority_idx" ON "PreferredPartBrand"("vehicleMakeId", "componentCategoryId", "active", "priority");
CREATE INDEX "PreferredPartBrand_vehicleMakeId_componentTypeId_active_priority_idx" ON "PreferredPartBrand"("vehicleMakeId", "componentTypeId", "active", "priority");
CREATE INDEX "PreferredPartBrand_partBrandId_affiliateStatus_idx" ON "PreferredPartBrand"("partBrandId", "affiliateStatus");
CREATE INDEX "PreferredPartBrand_offerProviderId_active_idx" ON "PreferredPartBrand"("offerProviderId", "active");
CREATE INDEX "PartOffer_providerId_active_lastCheckedAt_idx" ON "PartOffer"("providerId", "active", "lastCheckedAt");

ALTER TABLE "PartOfferProvider"
ADD CONSTRAINT "PartOfferProvider_affiliatePartnerId_fkey"
FOREIGN KEY ("affiliatePartnerId") REFERENCES "AffiliatePartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PreferredPartBrand"
ADD CONSTRAINT "PreferredPartBrand_vehicleMakeId_fkey"
FOREIGN KEY ("vehicleMakeId") REFERENCES "Make"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreferredPartBrand"
ADD CONSTRAINT "PreferredPartBrand_partBrandId_fkey"
FOREIGN KEY ("partBrandId") REFERENCES "PartBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreferredPartBrand"
ADD CONSTRAINT "PreferredPartBrand_componentCategoryId_fkey"
FOREIGN KEY ("componentCategoryId") REFERENCES "PartCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreferredPartBrand"
ADD CONSTRAINT "PreferredPartBrand_componentTypeId_fkey"
FOREIGN KEY ("componentTypeId") REFERENCES "PartComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreferredPartBrand"
ADD CONSTRAINT "PreferredPartBrand_offerProviderId_fkey"
FOREIGN KEY ("offerProviderId") REFERENCES "PartOfferProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartOffer"
ADD CONSTRAINT "PartOffer_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "PartOfferProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
