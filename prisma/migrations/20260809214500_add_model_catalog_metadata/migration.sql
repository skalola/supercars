ALTER TABLE "Model" ADD COLUMN "metadataStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED';
ALTER TABLE "Model" ADD COLUMN "metadataConfidence" DOUBLE PRECISION;
ALTER TABLE "Model" ADD COLUMN "metadataSource" TEXT;
ALTER TABLE "Model" ADD COLUMN "metadataSourceUrl" TEXT;
ALTER TABLE "Model" ADD COLUMN "lastMetadataAuditAt" TIMESTAMP(3);

ALTER TABLE "ModelImage" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "ModelImage" ADD COLUMN "sourceName" TEXT;
ALTER TABLE "ModelImage" ADD COLUMN "license" TEXT;
ALTER TABLE "ModelImage" ADD COLUMN "attribution" TEXT;
ALTER TABLE "ModelImage" ADD COLUMN "attributionUrl" TEXT;
ALTER TABLE "ModelImage" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "ModelImage" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED';

CREATE INDEX "Model_metadataStatus_idx" ON "Model"("metadataStatus");
CREATE INDEX "ModelImage_reviewStatus_idx" ON "ModelImage"("reviewStatus");
