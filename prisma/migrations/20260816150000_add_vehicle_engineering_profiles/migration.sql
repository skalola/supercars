CREATE TABLE "ModelEngineeringProfile" (
  "id" TEXT NOT NULL,
  "profileKey" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "variantId" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'MODEL',
  "yearStart" INTEGER,
  "yearEnd" INTEGER,
  "engineCode" TEXT,
  "engineDescription" TEXT,
  "aspiration" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "drivetrain" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "transmissionType" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "transmissionDescription" TEXT,
  "horsepower" INTEGER,
  "torqueLbFt" INTEGER,
  "weightLb" INTEGER,
  "frontTireWidthMm" INTEGER,
  "rearTireWidthMm" INTEGER,
  "frontWheelDiameterIn" INTEGER,
  "rearWheelDiameterIn" INTEGER,
  "tireCompound" TEXT,
  "tireLoadRating" TEXT,
  "frontRotorDiameterMm" INTEGER,
  "rearRotorDiameterMm" INTEGER,
  "frontBrakePistonCount" INTEGER,
  "rearBrakePistonCount" INTEGER,
  "brakeRotorMaterial" TEXT,
  "oilCooling" TEXT,
  "chargeCooling" TEXT,
  "transmissionCooling" TEXT,
  "brakeCooling" TEXT,
  "sustainedUseRating" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "confidence" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "reviewStatus" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelEngineeringProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelEngineeringProfile_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ModelEngineeringProfile_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ModelVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ModelEngineeringEvidence" (
  "id" TEXT NOT NULL,
  "evidenceKey" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "rawValue" TEXT,
  "confidence" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "notes" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelEngineeringEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelEngineeringEvidence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ModelEngineeringProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ModelEngineeringProfile_profileKey_key" ON "ModelEngineeringProfile"("profileKey");
CREATE INDEX "ModelEngineeringProfile_modelId_scope_idx" ON "ModelEngineeringProfile"("modelId", "scope");
CREATE INDEX "ModelEngineeringProfile_variantId_idx" ON "ModelEngineeringProfile"("variantId");
CREATE INDEX "ModelEngineeringProfile_reviewStatus_confidence_idx" ON "ModelEngineeringProfile"("reviewStatus", "confidence");
CREATE UNIQUE INDEX "ModelEngineeringEvidence_evidenceKey_key" ON "ModelEngineeringEvidence"("evidenceKey");
CREATE INDEX "ModelEngineeringEvidence_profileId_fieldName_idx" ON "ModelEngineeringEvidence"("profileId", "fieldName");
CREATE INDEX "ModelEngineeringEvidence_sourceType_confidence_idx" ON "ModelEngineeringEvidence"("sourceType", "confidence");
