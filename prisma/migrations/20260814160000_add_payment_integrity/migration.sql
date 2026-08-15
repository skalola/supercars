-- Store settlement money exactly instead of using binary floating point.
ALTER TABLE "Purchase"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "FulfillmentRequest"
  ALTER COLUMN "expectedPlatformFee" TYPE DECIMAL(14,2) USING ROUND("expectedPlatformFee"::numeric, 2),
  ALTER COLUMN "expectedPartnerCommission" TYPE DECIMAL(14,2) USING ROUND("expectedPartnerCommission"::numeric, 2),
  ALTER COLUMN "collectedAmount" TYPE DECIMAL(14,2) USING ROUND("collectedAmount"::numeric, 2),
  ALTER COLUMN "refundableAmount" TYPE DECIMAL(14,2) USING ROUND("refundableAmount"::numeric, 2);

ALTER TABLE "FulfillmentFee"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "DepositIntent"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2),
  ADD COLUMN "checkoutKey" TEXT,
  ADD COLUMN "checkoutSessionId" TEXT,
  ADD COLUMN "checkoutUrl" TEXT,
  ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "DepositIntent_checkoutKey_key" ON "DepositIntent"("checkoutKey");
CREATE UNIQUE INDEX "DepositIntent_checkoutSessionId_key" ON "DepositIntent"("checkoutSessionId");

CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "fulfillmentRequestId" TEXT,
  "errorMessage" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key"
  ON "PaymentWebhookEvent"("provider", "eventId");
CREATE INDEX "PaymentWebhookEvent_status_receivedAt_idx"
  ON "PaymentWebhookEvent"("status", "receivedAt");
CREATE INDEX "PaymentWebhookEvent_fulfillmentRequestId_idx"
  ON "PaymentWebhookEvent"("fulfillmentRequestId");
