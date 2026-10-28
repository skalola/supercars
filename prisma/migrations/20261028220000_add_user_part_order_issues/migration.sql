CREATE TABLE "UserPartOrderIssue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserPartOrderIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPartOrderIssue_orderId_reporterId_key" ON "UserPartOrderIssue"("orderId", "reporterId");
CREATE INDEX "UserPartOrderIssue_status_createdAt_idx" ON "UserPartOrderIssue"("status", "createdAt");
CREATE INDEX "UserPartOrderIssue_reporterId_createdAt_idx" ON "UserPartOrderIssue"("reporterId", "createdAt");
ALTER TABLE "UserPartOrderIssue" ADD CONSTRAINT "UserPartOrderIssue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "UserPartOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserPartOrderIssue" ADD CONSTRAINT "UserPartOrderIssue_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
