import { requireAdmin } from "@/lib/admin/auth";
import { getMarketingAutomationSettings } from "@/lib/admin/marketing-settings";
import { getMarketingEmailPreviews } from "@/lib/admin/marketing-email-previews";
import {
  AdminMarketingSettingsClient,
  AdminMarketingSettingRow,
} from "@/components/admin/AdminMarketingSettingsClient";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function AdminMarketingPage() {
  await requireAdmin();

  const settings = await getMarketingAutomationSettings();
  const previews = getMarketingEmailPreviews();
  const rows: AdminMarketingSettingRow[] = settings.map((setting) => ({
    key: setting.key,
    label: setting.label,
    description: setting.description,
    enabled: setting.enabled,
    updatedAt: formatDateTime(setting.updatedAt),
    updatedBy: setting.updatedBy,
    auditCount: setting._count.audits,
    latestAudit: setting.audits[0]
      ? {
          actor: setting.audits[0].actor,
          createdAt: formatDateTime(setting.audits[0].createdAt),
          previousValue: setting.audits[0].previousValue,
          newValue: setting.audits[0].newValue,
        }
      : null,
  }));

  return (
    <main className="page-shell wide">
      <AdminMarketingSettingsClient settings={rows} previews={previews} />
    </main>
  );
}
