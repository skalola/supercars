ALTER TABLE "PartComponentType"
ADD COLUMN "allowsUniversalFitment" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "UserPartListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "componentTypeId" TEXT NOT NULL,
    "brandId" TEXT,
    "removedFromVehicleId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "brandName" TEXT,
    "manufacturerPartNumber" TEXT,
    "condition" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "mileageOnPart" INTEGER,
    "includedHardware" TEXT,
    "knownDefects" TEXT,
    "shippingMode" TEXT NOT NULL DEFAULT 'SHIPPING',
    "shippingCostCents" INTEGER,
    "shipsFromCity" TEXT,
    "shipsFromState" TEXT,
    "returnPolicy" TEXT NOT NULL DEFAULT 'NO_RETURNS',
    "universalFitment" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPartListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserPartListingImage" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT,
    "alt" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "validationStatus" TEXT NOT NULL DEFAULT 'VALID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPartListingImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserPartListingFitment" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "fitmentKey" TEXT NOT NULL,
    "makeId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVariantId" TEXT,
    "yearStart" INTEGER,
    "yearEnd" INTEGER,
    "trim" TEXT,
    "engine" TEXT,
    "transmission" TEXT,
    "drivetrain" TEXT,
    "bodyStyle" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'SELLER_DECLARED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPartListingFitment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserPartListing_sellerId_status_createdAt_idx" ON "UserPartListing"("sellerId", "status", "createdAt");
CREATE INDEX "UserPartListing_componentTypeId_status_publishedAt_idx" ON "UserPartListing"("componentTypeId", "status", "publishedAt");
CREATE INDEX "UserPartListing_brandId_status_idx" ON "UserPartListing"("brandId", "status");
CREATE INDEX "UserPartListing_status_publishedAt_idx" ON "UserPartListing"("status", "publishedAt");
CREATE UNIQUE INDEX "UserPartListingImage_listingId_url_key" ON "UserPartListingImage"("listingId", "url");
CREATE INDEX "UserPartListingImage_listingId_validationStatus_displayOrder_idx" ON "UserPartListingImage"("listingId", "validationStatus", "displayOrder");
CREATE INDEX "UserPartListingImage_listingId_isPrimary_idx" ON "UserPartListingImage"("listingId", "isPrimary");
CREATE UNIQUE INDEX "UserPartListingFitment_fitmentKey_key" ON "UserPartListingFitment"("fitmentKey");
CREATE INDEX "UserPartListingFitment_listingId_idx" ON "UserPartListingFitment"("listingId");
CREATE INDEX "UserPartListingFitment_makeId_modelId_yearStart_yearEnd_idx" ON "UserPartListingFitment"("makeId", "modelId", "yearStart", "yearEnd");
CREATE INDEX "UserPartListingFitment_modelVariantId_idx" ON "UserPartListingFitment"("modelVariantId");

ALTER TABLE "UserPartListing" ADD CONSTRAINT "UserPartListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPartListing" ADD CONSTRAINT "UserPartListing_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "PartComponentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPartListing" ADD CONSTRAINT "UserPartListing_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "PartBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserPartListing" ADD CONSTRAINT "UserPartListing_removedFromVehicleId_fkey" FOREIGN KEY ("removedFromVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserPartListingImage" ADD CONSTRAINT "UserPartListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "UserPartListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPartListingFitment" ADD CONSTRAINT "UserPartListingFitment_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "UserPartListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPartListingFitment" ADD CONSTRAINT "UserPartListingFitment_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "Make"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPartListingFitment" ADD CONSTRAINT "UserPartListingFitment_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPartListingFitment" ADD CONSTRAINT "UserPartListingFitment_modelVariantId_fkey" FOREIGN KEY ("modelVariantId") REFERENCES "ModelVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
