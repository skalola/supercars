"use client";

import { useState, useTransition } from "react";
import { toggleTrackerPreference, type TrackerType } from "@/app/actions/trackers";

export type TrackerCard = {
  id: TrackerType;
  label: string;
  enabled: boolean;
  description: string;
  signal: string;
  countLabel: string;
};

export default function TrackersClient({ trackers }: { trackers: TrackerCard[] }) {
  const [localTrackers, setLocalTrackers] = useState(trackers);
  const [pendingId, setPendingId] = useState<TrackerType | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateTracker(id: TrackerType, enabled: boolean) {
    setPendingId(id);
    setLocalTrackers((current) =>
      current.map((tracker) => (tracker.id === id ? { ...tracker, enabled } : tracker))
    );

    startTransition(async () => {
      const result = await toggleTrackerPreference(id, enabled);
      if (!result.ok) {
        setLocalTrackers((current) =>
          current.map((tracker) => (tracker.id === id ? { ...tracker, enabled: !enabled } : tracker))
        );
      }
      setPendingId(null);
    });
  }

  return (
    <div className="tracker-grid">
      {localTrackers.map((tracker) => {
        const disabled = isPending && pendingId === tracker.id;
        return (
          <section key={tracker.id} className="tracker-card">
            <div className="tracker-card-top">
              <div>
                <div className="tracker-kicker">{tracker.countLabel}</div>
                <h2>{tracker.label}</h2>
              </div>
              <Switch
                checked={tracker.enabled}
                disabled={disabled}
                label={tracker.label}
                onChange={(checked) => updateTracker(tracker.id, checked)}
              />
            </div>
            <p className="tracker-description">{tracker.description}</p>
            <div className="tracker-signal">
              <span>Signal</span>
              <p>{tracker.signal}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`tracker-switch${disabled ? " is-disabled" : ""}`}>
      <span className="sr-only">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="tracker-switch-input"
      />
      <span className={`tracker-switch-track${checked ? " is-checked" : ""}`}>
        <span className="tracker-switch-knob" />
      </span>
    </label>
  );
}
