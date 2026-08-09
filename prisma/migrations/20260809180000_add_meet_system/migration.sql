-- SUPERCAR DASH Meets

CREATE TABLE "Meet" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "locationName" TEXT NOT NULL,
  "locationDetail" TEXT,
  "exactAddress" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "mapX" DOUBLE PRECISION,
  "mapY" DOUBLE PRECISION,
  "capacity" INTEGER,
  "description" TEXT,
  "allowedMakes" TEXT NOT NULL DEFAULT '[]',
  "heroImageUrl" TEXT,
  "publishedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Meet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetRsvp" (
  "id" TEXT NOT NULL,
  "meetId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'GOING',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MeetRsvp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetPhoto" (
  "id" TEXT NOT NULL,
  "meetId" TEXT NOT NULL,
  "userId" TEXT,
  "vehicleId" TEXT,
  "url" TEXT NOT NULL,
  "caption" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MeetPhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Meet_slug_key" ON "Meet"("slug");
CREATE INDEX "Meet_status_startsAt_idx" ON "Meet"("status", "startsAt");
CREATE INDEX "Meet_city_state_idx" ON "Meet"("city", "state");
CREATE INDEX "Meet_hostId_startsAt_idx" ON "Meet"("hostId", "startsAt");

CREATE UNIQUE INDEX "MeetRsvp_meetId_userId_key" ON "MeetRsvp"("meetId", "userId");
CREATE INDEX "MeetRsvp_userId_status_idx" ON "MeetRsvp"("userId", "status");
CREATE INDEX "MeetRsvp_vehicleId_idx" ON "MeetRsvp"("vehicleId");

CREATE INDEX "MeetPhoto_meetId_idx" ON "MeetPhoto"("meetId");
CREATE INDEX "MeetPhoto_vehicleId_idx" ON "MeetPhoto"("vehicleId");

ALTER TABLE "Meet"
  ADD CONSTRAINT "Meet_hostId_fkey"
  FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetRsvp"
  ADD CONSTRAINT "MeetRsvp_meetId_fkey"
  FOREIGN KEY ("meetId") REFERENCES "Meet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetRsvp"
  ADD CONSTRAINT "MeetRsvp_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetRsvp"
  ADD CONSTRAINT "MeetRsvp_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MeetPhoto"
  ADD CONSTRAINT "MeetPhoto_meetId_fkey"
  FOREIGN KEY ("meetId") REFERENCES "Meet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetPhoto"
  ADD CONSTRAINT "MeetPhoto_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MeetPhoto"
  ADD CONSTRAINT "MeetPhoto_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
