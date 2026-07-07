-- AlterTable
ALTER TABLE "Model" ADD COLUMN "bodyStyle" TEXT;
ALTER TABLE "Model" ADD COLUMN "category" TEXT;
ALTER TABLE "Model" ADD COLUMN "description" TEXT;
ALTER TABLE "Model" ADD COLUMN "productionCount" INTEGER;
ALTER TABLE "Model" ADD COLUMN "productionEndYear" INTEGER;
ALTER TABLE "Model" ADD COLUMN "productionStartYear" INTEGER;

-- CreateTable
CREATE TABLE "ModelSpec" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "engine" TEXT,
    "horsepower" TEXT,
    "torque" TEXT,
    "transmission" TEXT,
    "drivetrain" TEXT,
    "topSpeed" TEXT,
    "zeroToSixty" TEXT,
    "weight" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelSpec_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModelImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "type" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelImage_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelSpec_modelId_key" ON "ModelSpec"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelImage_modelId_url_key" ON "ModelImage"("modelId", "url");
