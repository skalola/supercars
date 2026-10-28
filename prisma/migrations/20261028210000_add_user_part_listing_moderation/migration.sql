ALTER TABLE "UserPartListing"
ADD COLUMN "moderatedAt" TIMESTAMP(3),
ADD COLUMN "moderatedById" TEXT,
ADD COLUMN "moderationReason" TEXT;
