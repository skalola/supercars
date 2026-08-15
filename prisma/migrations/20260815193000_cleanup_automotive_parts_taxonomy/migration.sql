ALTER TABLE "PartComponentType"
  ADD COLUMN "systemGroup" TEXT,
  ADD COLUMN "fitmentRisk" TEXT NOT NULL DEFAULT 'MEDIUM';

ALTER TABLE "PerformancePart"
  ADD COLUMN "material" TEXT,
  ADD COLUMN "replacementType" TEXT;
