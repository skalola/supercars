ALTER TABLE "VehicleInstalledPart"
ADD COLUMN "componentTypeId" TEXT;

ALTER TABLE "VehicleInstalledPart"
ADD CONSTRAINT "VehicleInstalledPart_componentTypeId_fkey"
FOREIGN KEY ("componentTypeId") REFERENCES "PartComponentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VehicleInstalledPart_componentTypeId_idx"
ON "VehicleInstalledPart"("componentTypeId");

CREATE TABLE "PartTypeRelationship" (
  "id" TEXT NOT NULL,
  "sourcePartTypeId" TEXT NOT NULL,
  "targetPartTypeId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartTypeRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartTypeRelationship_sourcePartTypeId_fkey" FOREIGN KEY ("sourcePartTypeId") REFERENCES "PartComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartTypeRelationship_targetPartTypeId_fkey" FOREIGN KEY ("targetPartTypeId") REFERENCES "PartComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartTypeRelationship_sourcePartTypeId_targetPartTypeId_relationshipType_key"
ON "PartTypeRelationship"("sourcePartTypeId", "targetPartTypeId", "relationshipType");
CREATE INDEX "PartTypeRelationship_sourcePartTypeId_active_relationshipType_idx"
ON "PartTypeRelationship"("sourcePartTypeId", "active", "relationshipType");
CREATE INDEX "PartTypeRelationship_targetPartTypeId_active_relationshipType_idx"
ON "PartTypeRelationship"("targetPartTypeId", "active", "relationshipType");

UPDATE "VehicleInstalledPart" installed
SET "componentTypeId" = part."componentTypeId"
FROM "PerformancePart" part
WHERE installed."partId" = part.id
  AND part."componentTypeId" IS NOT NULL
  AND installed."componentTypeId" IS NULL;
