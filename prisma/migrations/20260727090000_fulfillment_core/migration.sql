-- Add admin role support.
ALTER TABLE "User" ADD COLUMN "role" TEXT DEFAULT 'USER';

-- CreateTable
CREATE TABLE "FulfillmentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publicTransactionToken" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "cancellationReason" TEXT,
    "cancelledByActor" TEXT,
    "expectedPlatformFee" REAL NOT NULL DEFAULT 0,
    "expectedPartnerCommission" REAL NOT NULL DEFAULT 0,
    "collectedAmount" REAL NOT NULL DEFAULT 0,
    "refundableAmount" REAL NOT NULL DEFAULT 0,
    "partnerAcceptedAt" DATETIME,
    "completedAt" DATETIME,
    "payoutStatus" TEXT NOT NULL DEFAULT 'UNSETTLED',
    "buyerId" TEXT,
    "vehicleId" TEXT,
    "listingId" TEXT,
    "purchaseId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FulfillmentRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FulfillmentRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FulfillmentRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FulfillmentRequest_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FulfillmentParty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fulfillmentRequestId" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "companyName" TEXT,
    "address" TEXT,
    "roleDescription" TEXT,
    "partnerContactId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FulfillmentParty_fulfillmentRequestId_fkey" FOREIGN KEY ("fulfillmentRequestId") REFERENCES "FulfillmentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FulfillmentParty_partnerContactId_fkey" FOREIGN KEY ("partnerContactId") REFERENCES "PartnerContact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FulfillmentPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fulfillmentRequestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FulfillmentPackage_fulfillmentRequestId_fkey" FOREIGN KEY ("fulfillmentRequestId") REFERENCES "FulfillmentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FulfillmentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fulfillmentRequestId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "actorId" TEXT,
    "note" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FulfillmentEvent_fulfillmentRequestId_fkey" FOREIGN KEY ("fulfillmentRequestId") REFERENCES "FulfillmentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FulfillmentFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fulfillmentRequestId" TEXT NOT NULL,
    "feeType" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FulfillmentFee_fulfillmentRequestId_fkey" FOREIGN KEY ("fulfillmentRequestId") REFERENCES "FulfillmentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DepositIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fulfillmentRequestId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'AUTHORIZED',
    "paymentMethod" TEXT,
    "transactionRef" TEXT,
    "expiresAt" DATETIME,
    "capturedAt" DATETIME,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DepositIntent_fulfillmentRequestId_fkey" FOREIGN KEY ("fulfillmentRequestId") REFERENCES "FulfillmentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartnerDecisionToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fulfillmentRequestId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "partnerPartyId" TEXT,
    "partnerName" TEXT,
    "partnerEmail" TEXT,
    "expiresAt" DATETIME,
    "viewedAt" DATETIME,
    "actionTakenAt" DATETIME,
    "actionTaken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartnerDecisionToken_fulfillmentRequestId_fkey" FOREIGN KEY ("fulfillmentRequestId") REFERENCES "FulfillmentRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartnerContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "sourceDomain" TEXT,
    "makeSpecialization" TEXT DEFAULT 'ALL',
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contactSource" TEXT NOT NULL DEFAULT 'PUBLIC_WEBSITE',
    "confidence" TEXT NOT NULL DEFAULT 'PUBLIC_SOURCE',
    "contactStatus" TEXT NOT NULL DEFAULT 'RESOLVED',
    "lastVerifiedAt" DATETIME,
    "marketSourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartnerContact_marketSourceId_fkey" FOREIGN KEY ("marketSourceId") REFERENCES "MarketSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentRequest_publicTransactionToken_key" ON "FulfillmentRequest"("publicTransactionToken");
CREATE INDEX "FulfillmentRequest_requestType_status_idx" ON "FulfillmentRequest"("requestType", "status");
CREATE INDEX "FulfillmentRequest_publicTransactionToken_idx" ON "FulfillmentRequest"("publicTransactionToken");
CREATE INDEX "FulfillmentParty_fulfillmentRequestId_idx" ON "FulfillmentParty"("fulfillmentRequestId");
CREATE INDEX "FulfillmentPackage_fulfillmentRequestId_idx" ON "FulfillmentPackage"("fulfillmentRequestId");
CREATE INDEX "FulfillmentEvent_fulfillmentRequestId_idx" ON "FulfillmentEvent"("fulfillmentRequestId");
CREATE INDEX "FulfillmentFee_fulfillmentRequestId_idx" ON "FulfillmentFee"("fulfillmentRequestId");
CREATE INDEX "DepositIntent_fulfillmentRequestId_idx" ON "DepositIntent"("fulfillmentRequestId");
CREATE UNIQUE INDEX "PartnerDecisionToken_token_key" ON "PartnerDecisionToken"("token");
CREATE INDEX "PartnerDecisionToken_token_idx" ON "PartnerDecisionToken"("token");
CREATE INDEX "PartnerDecisionToken_fulfillmentRequestId_idx" ON "PartnerDecisionToken"("fulfillmentRequestId");
CREATE UNIQUE INDEX "PartnerContact_marketSourceId_key" ON "PartnerContact"("marketSourceId");
CREATE INDEX "PartnerContact_name_idx" ON "PartnerContact"("name");
CREATE INDEX "PartnerContact_type_makeSpecialization_idx" ON "PartnerContact"("type", "makeSpecialization");
CREATE INDEX "PartnerContact_contactStatus_idx" ON "PartnerContact"("contactStatus");
