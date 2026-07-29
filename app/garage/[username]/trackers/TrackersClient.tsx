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
    <div style={styles.grid}>
      {localTrackers.map((tracker) => {
        const disabled = isPending && pendingId === tracker.id;
        return (
          <section key={tracker.id} style={styles.card}>
            <div style={styles.cardTop}>
              <div>
                <div style={styles.kicker}>{tracker.countLabel}</div>
                <h2 style={styles.title}>{tracker.label}</h2>
              </div>
              <Switch
                checked={tracker.enabled}
                disabled={disabled}
                label={tracker.label}
                onChange={(checked) => updateTracker(tracker.id, checked)}
              />
            </div>
            <p style={styles.description}>{tracker.description}</p>
            <div style={styles.signal}>
              <span style={styles.signalLabel}>Signal</span>
              <span style={styles.signalText}>{tracker.signal}</span>
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
    <label style={{ ...styles.switchWrap, opacity: disabled ? 0.58 : 1 }}>
      <span style={styles.srOnly}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={styles.input}
      />
      <span style={trackStyle(checked)}>
        <span style={knobStyle(checked)} />
      </span>
    </label>
  );
}

function trackStyle(checked: boolean): React.CSSProperties {
  return {
    display: "block",
    position: "relative",
    width: 48,
    height: 28,
    borderRadius: 999,
    backgroundColor: checked ? "#111111" : "#dedfda",
    transition: "background-color 160ms ease",
  };
}

function knobStyle(checked: boolean): React.CSSProperties {
  return {
    position: "absolute",
    top: 4,
    left: checked ? 24 : 4,
    width: 20,
    height: 20,
    borderRadius: "50%",
    backgroundColor: "#ffffff",
    boxShadow: "0 1px 2px rgba(16, 24, 40, 0.18)",
    transition: "left 160ms ease",
  };
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: 14,
  },
  card: {
    display: "grid",
    gap: 18,
    alignContent: "start",
    minHeight: 230,
    padding: 20,
    border: "1px solid var(--line)",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    boxShadow: "var(--shadow-subtle)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
  },
  kicker: {
    color: "var(--muted)",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  title: {
    margin: "5px 0 0",
    color: "var(--foreground)",
    fontSize: 22,
    lineHeight: 1.12,
    fontWeight: 820,
  },
  description: {
    margin: 0,
    color: "var(--muted-strong)",
    fontSize: 14,
    lineHeight: 1.55,
  },
  signal: {
    display: "grid",
    gap: 6,
    paddingTop: 14,
    borderTop: "1px solid var(--line)",
  },
  signalLabel: {
    color: "var(--muted)",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  signalText: {
    color: "var(--foreground)",
    fontSize: 13,
    lineHeight: 1.45,
  },
  switchWrap: {
    position: "relative",
    display: "inline-flex",
    cursor: "pointer",
    flexShrink: 0,
  },
  input: {
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
};
