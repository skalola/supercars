"use client";

import { useState, useTransition } from "react";
import { updateMarketingAutomationSettingAction } from "@/app/actions/admin-marketing";
import type { MarketingEmailPreview } from "@/lib/admin/marketing-email-previews";

export type AdminMarketingSettingRow = {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

export function AdminMarketingSettingsClient({
  settings,
  previews,
}: {
  settings: AdminMarketingSettingRow[];
  previews: MarketingEmailPreview[];
}) {
  const [isPending, startTransition] = useTransition();
  const [localSettings, setLocalSettings] = useState(settings);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [selectedPreviewKey, setSelectedPreviewKey] = useState<string>(settings[0]?.key || "");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const selectedPreview = previews.find((preview) => preview.key === selectedPreviewKey) || previews[0] || null;
  const previewByKey = new Map(previews.map((preview) => [preview.key, preview]));

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
    <section className="admin-marketing-shell">
      <div className="surface-panel admin-management-panel">
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
            const preview = previewByKey.get(setting.key);
            const isSelected = selectedPreviewKey === setting.key;

            return (
              <div key={setting.key} className={`admin-toggle-row ${isSelected ? "is-selected" : ""}`}>
                <div>
                  <strong>{setting.label}</strong>
                  <p>{setting.description}</p>
                  <span>
                    Last updated {setting.updatedAt}
                    {setting.updatedBy ? ` by ${setting.updatedBy}` : ""}
                  </span>
                </div>

                <div className="admin-marketing-row-actions">
                  {preview && (
                    <button
                      type="button"
                      className="admin-secondary-button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedPreviewKey(setting.key)}
                    >
                      Preview
                    </button>
                  )}
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
              </div>
            );
          })}
        </div>
      </div>

      {selectedPreview && (
        <aside className="surface-panel admin-email-preview-panel" aria-label="Marketing email preview">
          <div className="admin-email-preview-header">
            <div>
              <p className="eyebrow">{selectedPreview.eyebrow}</p>
              <h2>Email Preview</h2>
            </div>
            <span>No send triggered</span>
          </div>

          <div className="admin-email-preview-meta">
            <div>
              <span>From</span>
              <strong>{selectedPreview.from}</strong>
            </div>
            <div>
              <span>Subject</span>
              <strong>{selectedPreview.subject}</strong>
            </div>
            <div>
              <span>Audience</span>
              <strong>{selectedPreview.audience}</strong>
            </div>
            <div>
              <span>Trigger</span>
              <strong>{selectedPreview.trigger}</strong>
            </div>
          </div>

          <div className="admin-email-preview-device">
            <div className="admin-email-preview-toolbar">
              <span>Inbox visual</span>
              <em>Rendered HTML</em>
            </div>
            <iframe
              title={`${selectedPreview.eyebrow} email preview`}
              srcDoc={selectedPreview.html}
              sandbox=""
            />
          </div>

          <details className="admin-email-preview-text">
            <summary>Plain-text fallback</summary>
            <pre>{selectedPreview.text}</pre>
          </details>
        </aside>
      )}
    </section>
  );
}
