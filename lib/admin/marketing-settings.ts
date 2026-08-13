import { prisma } from "@/lib/prisma";

export const MARKETING_AUTOMATION_SETTINGS = [
  {
    key: "price_tracking_alerts",
    label: "Price Tracking Alerts",
    description: "Send marketplace price movement alerts when automation jobs are enabled.",
    defaultEnabled: false,
  },
  {
    key: "listing_tracker_alerts",
    label: "Listing Tracker Alerts",
    description: "Send saved-car emails when new matching listings are added.",
    defaultEnabled: false,
  },
  {
    key: "maintenance_alerts",
    label: "Maintenance Alerts",
    description: "Send service reminder emails based on Vehicle Passport maintenance signals.",
    defaultEnabled: false,
  },
  {
    key: "event_alerts",
    label: "Event Alerts",
    description: "Send meet hosting, RSVP, cancellation, and reminder emails.",
    defaultEnabled: true,
  },
  {
    key: "transaction_flow_alerts",
    label: "Transaction Flow Alerts",
    description: "Send lifecycle emails for purchase, service, transport, and insurance requests.",
    defaultEnabled: true,
  },
  {
    key: "welcome_emails",
    label: "Welcome Emails",
    description: "Send onboarding emails after a new user signs in or creates an account.",
    defaultEnabled: false,
  },
] as const;

export type MarketingAutomationSettingKey = (typeof MARKETING_AUTOMATION_SETTINGS)[number]["key"];

export function isMarketingAutomationSettingKey(key: string): key is MarketingAutomationSettingKey {
  return MARKETING_AUTOMATION_SETTINGS.some((setting) => setting.key === key);
}

export async function getMarketingAutomationSettings() {
  let rows = await readMarketingAutomationSettings();
  const existingKeys = new Set(rows.map((row) => row.key));
  const missingSettings = MARKETING_AUTOMATION_SETTINGS.filter((setting) => !existingKeys.has(setting.key));

  if (missingSettings.length > 0) {
    await prisma.globalSetting.createMany({
      data: missingSettings.map((setting) => ({
        key: setting.key,
        label: setting.label,
        description: setting.description,
        category: "MARKETING_AUTOMATION",
        enabled: setting.defaultEnabled,
      })),
      skipDuplicates: true,
    });
    rows = await readMarketingAutomationSettings();
  }

  return rows.sort((a, b) => {
    const aIndex = MARKETING_AUTOMATION_SETTINGS.findIndex((setting) => setting.key === a.key);
    const bIndex = MARKETING_AUTOMATION_SETTINGS.findIndex((setting) => setting.key === b.key);
    return aIndex - bIndex;
  });
}

function readMarketingAutomationSettings() {
  return prisma.globalSetting.findMany({
    where: {
      key: { in: MARKETING_AUTOMATION_SETTINGS.map((setting) => setting.key) },
    },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: { audits: true },
      },
    },
  });
}
