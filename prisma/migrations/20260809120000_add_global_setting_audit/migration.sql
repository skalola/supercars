CREATE TABLE "GlobalSettingAudit" (
    "id" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "previousValue" BOOLEAN,
    "newValue" BOOLEAN NOT NULL,
    "actor" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalSettingAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GlobalSettingAudit_settingKey_idx" ON "GlobalSettingAudit"("settingKey");
CREATE INDEX "GlobalSettingAudit_createdAt_idx" ON "GlobalSettingAudit"("createdAt");

ALTER TABLE "GlobalSettingAudit" ADD CONSTRAINT "GlobalSettingAudit_settingKey_fkey" FOREIGN KEY ("settingKey") REFERENCES "GlobalSetting"("key") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "GlobalSetting"
SET "enabled" = true
WHERE "key" = 'transaction_flow_alerts';
