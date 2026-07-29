import { prisma } from "@/lib/prisma";

export const MARKETING_AUTOMATION_SETTINGS = [
  {
    key: "price_tracking_alerts",
    label: "Price Tracking Alerts",
    description: "Send marketplace price movement alerts when automation jobs are enabled.",
  },
  {
    key: "listing_tracker_alerts",
    label: "Listing Tracker Alerts",
    description: "Send saved-car emails when new matching listings are added.",
  },
  {
    key: "maintenance_alerts",
    label: "Maintenance Alerts",
    description: "Send service reminder emails based on Vehicle Passport maintenance signals.",
  },
  {
    key: "transaction_flow_alerts",
    label: "Transaction Flow Alerts",
    description: "Send lifecycle emails for purchase, service, transport, and insurance requests.",
  },
  {
    key: "welcome_emails",
    label: "Welcome Emails",
    description: "Send onboarding emails after a new user signs in or creates an account.",
  },
] as const;

export type MarketingAutomationSettingKey = (typeof MARKETING_AUTOMATION_SETTINGS)[number]["key"];

export function isMarketingAutomationSettingKey(key: string): key is MarketingAutomationSettingKey {
  return MARKETING_AUTOMATION_SETTINGS.some((setting) => setting.key === key);
}

export async function getMarketingAutomationSettings() {
  const rows = await Promise.all(
    MARKETING_AUTOMATION_SETTINGS.map((setting) =>
      prisma.globalSetting.upsert({
        where: { key: setting.key },
        update: {
          label: setting.label,
          description: setting.description,
          category: "MARKETING_AUTOMATION",
        },
        create: {
          key: setting.key,
          label: setting.label,
          description: setting.description,
          category: "MARKETING_AUTOMATION",
          enabled: false,
        },
      })
    )
  );

  return rows.sort((a, b) => {
    const aIndex = MARKETING_AUTOMATION_SETTINGS.findIndex((setting) => setting.key === a.key);
    const bIndex = MARKETING_AUTOMATION_SETTINGS.findIndex((setting) => setting.key === b.key);
    return aIndex - bIndex;
  });
}
