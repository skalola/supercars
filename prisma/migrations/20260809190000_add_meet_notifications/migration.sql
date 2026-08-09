CREATE TABLE "MeetNotification" (
  "id" TEXT NOT NULL,
  "meetId" TEXT NOT NULL,
  "userId" TEXT,
  "notificationType" TEXT NOT NULL,
  "recipientEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "providerMessageId" TEXT,
  "subject" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MeetNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetNotification_meetId_notificationType_idx" ON "MeetNotification"("meetId", "notificationType");
CREATE INDEX "MeetNotification_userId_notificationType_idx" ON "MeetNotification"("userId", "notificationType");
CREATE INDEX "MeetNotification_status_createdAt_idx" ON "MeetNotification"("status", "createdAt");

ALTER TABLE "MeetNotification"
  ADD CONSTRAINT "MeetNotification_meetId_fkey"
  FOREIGN KEY ("meetId") REFERENCES "Meet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetNotification"
  ADD CONSTRAINT "MeetNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
