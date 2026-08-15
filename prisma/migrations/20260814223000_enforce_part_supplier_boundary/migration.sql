-- Canonical identity belongs to the durable part, not to a marketplace offer.
ALTER TABLE "PerformancePart"
ADD COLUMN "componentType" TEXT;

-- Supplier-specific evidence and pricing belong to PartOffer.
ALTER TABLE "PartOffer"
ADD COLUMN "sellerQualityScore" INTEGER,
ADD COLUMN "oemMatchType" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "genuineOemStatus" TEXT NOT NULL DEFAULT 'NOT_STATED',
ADD COLUMN "compatibilityStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "shippingCostCents" INTEGER,
ADD COLUMN "shippingCurrency" TEXT;
