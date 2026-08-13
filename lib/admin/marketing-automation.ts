import { prisma } from "@/lib/prisma";
import {
  MARKETING_AUTOMATION_SETTINGS,
  isMarketingAutomationSettingKey,
  type MarketingAutomationSettingKey,
} from "./marketing-settings";

const GATE_CACHE_TTL_MS = 5 * 60 * 1000;
const gateCache = new Map<MarketingAutomationSettingKey, { enabled: boolean; expiresAt: number }>();

export async function isMarketingAutomationEnabled(key: MarketingAutomationSettingKey) {
  const definition = MARKETING_AUTOMATION_SETTINGS.find((setting) => setting.key === key);
  if (!definition) return false;

  const cached = gateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;

  const setting = await prisma.globalSetting.findUnique({
    where: { key },
    select: { enabled: true },
  });
  const enabled = setting?.enabled ?? definition.defaultEnabled;
  gateCache.set(key, { enabled, expiresAt: Date.now() + GATE_CACHE_TTL_MS });
  return enabled;
}

export function clearMarketingAutomationGateCache(key?: MarketingAutomationSettingKey) {
  if (key) gateCache.delete(key);
  else gateCache.clear();
}

export async function shouldSendMarketingAutomation(key: MarketingAutomationSettingKey) {
  if (!isMarketingAutomationSettingKey(key)) {
    return { enabled: false, skipped: "unknown_marketing_automation_setting" };
  }

  const enabled = await isMarketingAutomationEnabled(key);
  if (enabled) return { enabled: true };

  return { enabled: false, skipped: `${key}_disabled` };
}
