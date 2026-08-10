ALTER TABLE "Meet" ADD COLUMN "clubId" TEXT;

CREATE TABLE "CarClub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'US',
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarClub_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CarClubMember" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarClubMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CarClubModel" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarClubModel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CarClub_slug_key" ON "CarClub"("slug");
CREATE INDEX "CarClub_creatorId_idx" ON "CarClub"("creatorId");
CREATE INDEX "CarClub_city_state_idx" ON "CarClub"("city", "state");
CREATE INDEX "CarClub_status_visibility_idx" ON "CarClub"("status", "visibility");

CREATE UNIQUE INDEX "CarClubMember_clubId_userId_key" ON "CarClubMember"("clubId", "userId");
CREATE INDEX "CarClubMember_clubId_status_idx" ON "CarClubMember"("clubId", "status");
CREATE INDEX "CarClubMember_userId_status_idx" ON "CarClubMember"("userId", "status");

CREATE UNIQUE INDEX "CarClubModel_clubId_modelId_key" ON "CarClubModel"("clubId", "modelId");
CREATE INDEX "CarClubModel_modelId_idx" ON "CarClubModel"("modelId");

CREATE INDEX "Meet_clubId_startsAt_idx" ON "Meet"("clubId", "startsAt");

ALTER TABLE "Meet" ADD CONSTRAINT "Meet_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "CarClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CarClub" ADD CONSTRAINT "CarClub_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarClubMember" ADD CONSTRAINT "CarClubMember_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "CarClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarClubMember" ADD CONSTRAINT "CarClubMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarClubModel" ADD CONSTRAINT "CarClubModel_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "CarClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CarClubModel" ADD CONSTRAINT "CarClubModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
