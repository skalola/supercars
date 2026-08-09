import { prisma } from "@/lib/prisma";
import {
  MARKETING_AUTOMATION_SETTINGS,
  isMarketingAutomationSettingKey,
  type MarketingAutomationSettingKey,
} from "./marketing-settings";

export async function isMarketingAutomationEnabled(key: MarketingAutomationSettingKey) {
  const definition = MARKETING_AUTOMATION_SETTINGS.find((setting) => setting.key === key);
  if (!definition) return false;

  const setting = await prisma.globalSetting.upsert({
    where: { key },
    update: {
      label: definition.label,
      description: definition.description,
      category: "MARKETING_AUTOMATION",
    },
    create: {
      key,
      label: definition.label,
      description: definition.description,
      category: "MARKETING_AUTOMATION",
      enabled: definition.defaultEnabled,
    },
    select: { enabled: true },
  });

  return setting?.enabled === true;
}

export async function shouldSendMarketingAutomation(key: MarketingAutomationSettingKey) {
  if (!isMarketingAutomationSettingKey(key)) {
    return { enabled: false, skipped: "unknown_marketing_automation_setting" };
  }

  const enabled = await isMarketingAutomationEnabled(key);
  if (enabled) return { enabled: true };

  return { enabled: false, skipped: `${key}_disabled` };
}
