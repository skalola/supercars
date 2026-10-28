ALTER TABLE "UserPartOrder"
ADD COLUMN "fulfillmentReminderSentAt" TIMESTAMP(3),
ADD COLUMN "fulfillmentReminderLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "fulfillmentReminderAttempts" INTEGER NOT NULL DEFAULT 0;
