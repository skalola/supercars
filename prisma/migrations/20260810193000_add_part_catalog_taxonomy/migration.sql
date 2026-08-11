CREATE TABLE "PartCatalogNode" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "placeholderOnly" BOOLEAN NOT NULL DEFAULT true,
    "inventoryStatus" TEXT NOT NULL DEFAULT 'SHELL_ONLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartCatalogNode_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PerformancePart" ADD COLUMN "catalogNodeId" TEXT;

CREATE UNIQUE INDEX "PartCatalogNode_path_key" ON "PartCatalogNode"("path");
CREATE INDEX "PartCatalogNode_categoryId_active_idx" ON "PartCatalogNode"("categoryId", "active");
CREATE INDEX "PartCatalogNode_parentId_displayOrder_idx" ON "PartCatalogNode"("parentId", "displayOrder");
CREATE INDEX "PartCatalogNode_inventoryStatus_idx" ON "PartCatalogNode"("inventoryStatus");
CREATE INDEX "PerformancePart_catalogNodeId_status_idx" ON "PerformancePart"("catalogNodeId", "status");

ALTER TABLE "PartCatalogNode" ADD CONSTRAINT "PartCatalogNode_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PartCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartCatalogNode" ADD CONSTRAINT "PartCatalogNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PartCatalogNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformancePart" ADD CONSTRAINT "PerformancePart_catalogNodeId_fkey" FOREIGN KEY ("catalogNodeId") REFERENCES "PartCatalogNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
