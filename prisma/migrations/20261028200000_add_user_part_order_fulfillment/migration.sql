ALTER TABLE "UserPartOrder"
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "shippingCarrier" TEXT,
ADD COLUMN "trackingNumber" TEXT,
ADD COLUMN "trackingUrl" TEXT,
ADD COLUMN "sellerNote" TEXT;
