ALTER TABLE "UserPartListing"
ADD COLUMN "shippingRestriction" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "sellerAttestedAt" TIMESTAMP(3),
ADD COLUMN "sellerPolicyVersion" TEXT;
