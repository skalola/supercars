ALTER TABLE "UserPartOrder"
ADD COLUMN "disputeId" TEXT,
ADD COLUMN "disputeStatus" TEXT,
ADD COLUMN "disputeReason" TEXT,
ADD COLUMN "preDisputeStatus" TEXT,
ADD COLUMN "disputedAt" TIMESTAMP(3),
ADD COLUMN "disputeResolvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "UserPartOrder_disputeId_key" ON "UserPartOrder"("disputeId");
