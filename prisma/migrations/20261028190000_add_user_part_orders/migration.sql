CREATE TABLE "UserPartOrder" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "itemAmountCents" INTEGER NOT NULL,
    "shippingAmountCents" INTEGER NOT NULL DEFAULT 0,
    "platformFeeCents" INTEGER NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'CHECKOUT_PENDING',
    "checkoutKey" TEXT NOT NULL,
    "checkoutSessionId" TEXT,
    "checkoutUrl" TEXT,
    "checkoutExpiresAt" TIMESTAMP(3),
    "paymentIntentId" TEXT,
    "chargeId" TEXT,
    "connectedAccountId" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "buyerName" TEXT,
    "shippingName" TEXT,
    "shippingAddress" JSONB,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPartOrder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "userPartOrderId" TEXT;

CREATE UNIQUE INDEX "UserPartOrder_checkoutKey_key" ON "UserPartOrder"("checkoutKey");
CREATE UNIQUE INDEX "UserPartOrder_checkoutSessionId_key" ON "UserPartOrder"("checkoutSessionId");
CREATE UNIQUE INDEX "UserPartOrder_paymentIntentId_key" ON "UserPartOrder"("paymentIntentId");
CREATE INDEX "UserPartOrder_buyerId_status_createdAt_idx" ON "UserPartOrder"("buyerId", "status", "createdAt");
CREATE INDEX "UserPartOrder_sellerId_status_createdAt_idx" ON "UserPartOrder"("sellerId", "status", "createdAt");
CREATE INDEX "UserPartOrder_listingId_status_idx" ON "UserPartOrder"("listingId", "status");
CREATE INDEX "UserPartOrder_status_checkoutExpiresAt_idx" ON "UserPartOrder"("status", "checkoutExpiresAt");
CREATE INDEX "PaymentWebhookEvent_userPartOrderId_idx" ON "PaymentWebhookEvent"("userPartOrderId");

ALTER TABLE "UserPartOrder" ADD CONSTRAINT "UserPartOrder_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "UserPartListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPartOrder" ADD CONSTRAINT "UserPartOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPartOrder" ADD CONSTRAINT "UserPartOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_userPartOrderId_fkey" FOREIGN KEY ("userPartOrderId") REFERENCES "UserPartOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
