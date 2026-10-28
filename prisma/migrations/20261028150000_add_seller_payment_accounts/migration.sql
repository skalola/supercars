CREATE TABLE "SellerPaymentAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'STRIPE',
    "providerAccountId" TEXT NOT NULL,
    "onboardingStatus" TEXT NOT NULL DEFAULT 'INCOMPLETE',
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "requirementsDue" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirementsPastDue" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disabledReason" TEXT,
    "country" TEXT,
    "defaultCurrency" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerPaymentAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerPaymentAccount_userId_key" ON "SellerPaymentAccount"("userId");
CREATE UNIQUE INDEX "SellerPaymentAccount_providerAccountId_key" ON "SellerPaymentAccount"("providerAccountId");
CREATE INDEX "SellerPaymentAccount_onboardingStatus_idx" ON "SellerPaymentAccount"("onboardingStatus");
CREATE INDEX "SellerPaymentAccount_chargesEnabled_payoutsEnabled_idx" ON "SellerPaymentAccount"("chargesEnabled", "payoutsEnabled");

ALTER TABLE "SellerPaymentAccount"
ADD CONSTRAINT "SellerPaymentAccount_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
