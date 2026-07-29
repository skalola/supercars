"use client";

import { useState, useTransition } from "react";
import { updateMarketingAutomationSettingAction } from "@/app/actions/admin-marketing";

export type AdminMarketingSettingRow = {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

export function AdminMarketingSettingsClient({ settings }: { settings: AdminMarketingSettingRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [localSettings, setLocalSettings] = useState(settings);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const toggleSetting = (key: string, enabled: boolean) => {
    setProcessingKey(key);
    setMessage(null);
    setLocalSettings((prev) =>
      prev.map((setting) => (setting.key === key ? { ...setting, enabled } : setting))
    );

    startTransition(async () => {
      const result = await updateMarketingAutomationSettingAction(key, enabled);
      setMessage({ type: result.success ? "success" : "error", text: result.message });
      setProcessingKey(null);

      if (!result.success) {
        setLocalSettings((prev) =>
          prev.map((setting) => (setting.key === key ? { ...setting, enabled: !enabled } : setting))
        );
      }
    });
  };

  return (
    <section className="surface-panel admin-management-panel">
      <div className="admin-management-panel-header">
        <div>
          <p className="eyebrow">Marketing</p>
          <h2>Email Automation Controls</h2>
        </div>
        <span>{localSettings.filter((setting) => setting.enabled).length} enabled</span>
      </div>

      {message && (
        <div className={`admin-action-message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="admin-toggle-list">
        {localSettings.map((setting) => {
          const isBusy = isPending && processingKey === setting.key;

          return (
            <div key={setting.key} className="admin-toggle-row">
              <div>
                <strong>{setting.label}</strong>
                <p>{setting.description}</p>
                <span>
                  Last updated {setting.updatedAt}
                  {setting.updatedBy ? ` by ${setting.updatedBy}` : ""}
                </span>
              </div>

              <label className="admin-toggle-switch">
                <input
                  type="checkbox"
                  checked={setting.enabled}
                  disabled={isBusy}
                  onChange={(event) => toggleSetting(setting.key, event.target.checked)}
                />
                <span aria-hidden="true" />
                <em>{setting.enabled ? "Enabled" : "Disabled"}</em>
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
