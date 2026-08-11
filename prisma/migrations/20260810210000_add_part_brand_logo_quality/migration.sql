ALTER TABLE "PartBrand" ADD COLUMN "logoSourceUrl" TEXT;
ALTER TABLE "PartBrand" ADD COLUMN "logoBackground" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "PartBrand" ADD COLUMN "logoVerifiedAt" TIMESTAMP(3);
ALTER TABLE "PartBrand" ADD COLUMN "logoNeedsReview" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PartBrand"
SET
  "logoBackground" = 'GENERATED_PLACEHOLDER',
  "logoNeedsReview" = true,
  "logoUrl" = NULL
WHERE "logoUrl" LIKE '/parts/placeholders/brand/%';
