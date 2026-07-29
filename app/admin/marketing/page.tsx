import { requireAdmin } from "@/lib/admin/auth";
import { getMarketingAutomationSettings } from "@/lib/admin/marketing-settings";
import {
  AdminMarketingSettingsClient,
  AdminMarketingSettingRow,
} from "@/components/admin/AdminMarketingSettingsClient";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default async function AdminMarketingPage() {
  await requireAdmin();

  const settings = await getMarketingAutomationSettings();
  const rows: AdminMarketingSettingRow[] = settings.map((setting) => ({
    key: setting.key,
    label: setting.label,
    description: setting.description,
    enabled: setting.enabled,
    updatedAt: formatDate(setting.updatedAt),
    updatedBy: setting.updatedBy,
  }));

  return (
    <main className="page-shell wide">
      <AdminMarketingSettingsClient settings={rows} />
    </main>
  );
}
