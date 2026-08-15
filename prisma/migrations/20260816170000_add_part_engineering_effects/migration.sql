CREATE TABLE "PartEngineeringEffect" (
  "id" TEXT NOT NULL,
  "componentTypeId" TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL DEFAULT '1.0.0',
  "primaryDimension" TEXT NOT NULL,
  "benefits" JSONB NOT NULL,
  "tradeoffs" JSONB NOT NULL,
  "dependencies" JSONB NOT NULL,
  "risks" JSONB NOT NULL,
  "buildIntentions" JSONB NOT NULL,
  "confidence" TEXT NOT NULL DEFAULT 'LOW',
  "evidenceBasis" TEXT,
  "reviewStatus" TEXT NOT NULL DEFAULT 'AUTO_BASELINE',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartEngineeringEffect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartEngineeringEffect_componentTypeId_fkey" FOREIGN KEY ("componentTypeId") REFERENCES "PartComponentType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartEngineeringEffect_componentTypeId_key" ON "PartEngineeringEffect"("componentTypeId");
CREATE INDEX "PartEngineeringEffect_primaryDimension_active_idx" ON "PartEngineeringEffect"("primaryDimension", "active");
CREATE INDEX "PartEngineeringEffect_reviewStatus_confidence_idx" ON "PartEngineeringEffect"("reviewStatus", "confidence");
