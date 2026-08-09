CREATE TABLE "ModelImageCandidate" (
    "id" TEXT NOT NULL,
    "modelId" TEXT,
    "makeId" TEXT,
    "makeName" TEXT NOT NULL,
    "modelName" TEXT,
    "baseModelName" TEXT,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "license" TEXT,
    "attribution" TEXT,
    "attributionUrl" TEXT,
    "title" TEXT,
    "category" TEXT,
    "context" TEXT,
    "confidence" DOUBLE PRECISION,
    "reviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "matchedModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelImageCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelImageCandidate_source_url_makeName_key" ON "ModelImageCandidate"("source", "url", "makeName");
CREATE INDEX "ModelImageCandidate_makeName_idx" ON "ModelImageCandidate"("makeName");
CREATE INDEX "ModelImageCandidate_baseModelName_idx" ON "ModelImageCandidate"("baseModelName");
CREATE INDEX "ModelImageCandidate_matchedModelId_idx" ON "ModelImageCandidate"("matchedModelId");

ALTER TABLE "ModelImageCandidate" ADD CONSTRAINT "ModelImageCandidate_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE SET NULL ON UPDATE CASCADE;
