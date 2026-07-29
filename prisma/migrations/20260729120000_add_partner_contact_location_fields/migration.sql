ALTER TABLE "PartnerContact" ADD COLUMN "streetAddress" TEXT;
ALTER TABLE "PartnerContact" ADD COLUMN "city" TEXT;
ALTER TABLE "PartnerContact" ADD COLUMN "state" TEXT;
ALTER TABLE "PartnerContact" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "PartnerContact" ADD COLUMN "country" TEXT DEFAULT 'US';
ALTER TABLE "PartnerContact" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "PartnerContact" ADD COLUMN "longitude" DOUBLE PRECISION;

CREATE INDEX "PartnerContact_state_city_idx" ON "PartnerContact"("state", "city");
CREATE INDEX "PartnerContact_latitude_longitude_idx" ON "PartnerContact"("latitude", "longitude");
