CREATE TABLE "ActionRateLimit" (
  "id" TEXT NOT NULL,
  "actorKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "bucketKey" TEXT NOT NULL DEFAULT 'GLOBAL',
  "windowStart" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ActionRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActionRateLimit_actorKey_action_bucketKey_windowStart_key" ON "ActionRateLimit"("actorKey", "action", "bucketKey", "windowStart");
CREATE INDEX "ActionRateLimit_expiresAt_idx" ON "ActionRateLimit"("expiresAt");
CREATE INDEX "ActionRateLimit_actorKey_action_idx" ON "ActionRateLimit"("actorKey", "action");
