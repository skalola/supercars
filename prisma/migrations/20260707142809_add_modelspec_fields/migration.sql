-- AlterTable
ALTER TABLE "ModelSpec" ADD COLUMN "cylinders" TEXT;
ALTER TABLE "ModelSpec" ADD COLUMN "displacement" TEXT;

-- CreateTable
CREATE TABLE "ModelVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "productionStartYear" INTEGER,
    "productionEndYear" INTEGER,
    "productionCount" INTEGER,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelVariant_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelVariant_modelId_slug_key" ON "ModelVariant"("modelId", "slug");
