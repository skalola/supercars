"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleGarageAlert } from "@/app/actions/garage";

export type GarageClaimedVehicle = {
  id: string;
  vin: string;
  year: number;
  status: string;
  mileage: number | null;
  image: string | null;
  makeName: string;
  makeSlug: string;
  modelName: string;
  modelSlug: string;
  trim: string | null;
};

export type GarageSavedVehicle = {
  id: string;
  image: string | null;
  makeName: string;
  makeSlug: string;
  modelName: string;
  modelSlug: string;
  years: string | null;
  priceTrackerAlertsEnabled: boolean;
  listingTrackerAlertsEnabled: boolean;
};

type GarageTabsProps = {
  claimedVehicles: GarageClaimedVehicle[];
  savedVehicles: GarageSavedVehicle[];
  isOwner?: boolean;
};

type ActiveTab = "claimed" | "saved";

export default function GarageTabs({ claimedVehicles, savedVehicles, isOwner = true }: GarageTabsProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(claimedVehicles.length > 0 ? "claimed" : "saved");
  const [localSavedVehicles, setLocalSavedVehicles] = useState(savedVehicles);
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeCount = activeTab === "claimed" ? claimedVehicles.length : savedVehicles.length;

  return (
    <section style={styles.shell}>
      <div role="tablist" aria-label="Garage vehicle categories" style={styles.tabs}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "claimed"}
          onClick={() => setActiveTab("claimed")}
          style={tabStyle(activeTab === "claimed")}
        >
          <span>Claimed vehicles</span>
          <span style={countStyle(activeTab === "claimed")}>{claimedVehicles.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "saved"}
          onClick={() => setActiveTab("saved")}
          style={tabStyle(activeTab === "saved")}
        >
          <span>Saved vehicles</span>
          <span style={countStyle(activeTab === "saved")}>{savedVehicles.length}</span>
        </button>
      </div>

      {activeCount === 0 ? (
        <div style={styles.emptyPanel}>
          <h2 style={styles.emptyTitle}>
            {activeTab === "claimed" ? "No claimed vehicles yet" : "No saved vehicles yet"}
          </h2>
          <p style={styles.emptyCopy}>
            {activeTab === "claimed"
              ? "Claim a VIN-backed vehicle passport to manage ownership, service, and selling workflows."
              : "Save supported supercar models from model pages to keep them in your garage."}
          </p>
          <Link href="/inventory" style={styles.emptyLink}>
            Browse Market
          </Link>
        </div>
      ) : activeTab === "claimed" ? (
        <div style={styles.grid}>
          {claimedVehicles.map((vehicle) => (
            <Link key={vehicle.id} href={`/vehicle/${vehicle.vin}`} className="clean-link" style={styles.card}>
              <VehicleImage src={vehicle.image} alt={`${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}`} />
              <div style={styles.cardBody}>
                <div style={styles.kicker}>{vehicle.makeName}</div>
                <h2 style={styles.cardTitle}>
                  {vehicle.year} {vehicle.modelName}
                </h2>
                {vehicle.trim && <p style={styles.meta}>{vehicle.trim}</p>}
                <div style={styles.cardFooter}>
                  <span style={styles.claimedBadge}>{vehicle.status === "CLAIMED" ? "Claimed" : "Claim pending"}</span>
                  <span style={styles.vin}>{vehicle.vin}</span>
                </div>
                <p style={styles.mileage}>
                  {vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} miles` : "Mileage unavailable"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div style={styles.grid}>
          {localSavedVehicles.map((item) => (
            <article key={item.id} style={styles.card}>
              <Link href={`/make/${item.makeSlug}/${item.modelSlug}`} className="clean-link">
              <VehicleImage src={item.image} alt={`${item.makeName} ${item.modelName}`} />
              </Link>
              <div style={styles.cardBody}>
                <div style={styles.kicker}>{item.makeName}</div>
                <Link href={`/make/${item.makeSlug}/${item.modelSlug}`} className="clean-link">
                  <h2 style={styles.cardTitle}>{item.modelName}</h2>
                </Link>
                <p style={styles.meta}>{item.years ?? "Production years unavailable"}</p>
                <div style={styles.cardFooter}>
                  <span style={styles.savedBadge}>Saved</span>
                  <span style={styles.modelPath}>{item.makeName} model</span>
                </div>
                {isOwner ? (
                  <div style={styles.alertPanel} aria-label={`${item.makeName} ${item.modelName} alerts`}>
                    <AlertToggle
                      label="Price tracker"
                      detail="Email me when tracked listings drop in price."
                      checked={item.priceTrackerAlertsEnabled}
                      disabled={isPending && pendingAlertId === `${item.id}:price`}
                      onChange={(checked) => updateAlert(item.id, "price", checked)}
                    />
                    <AlertToggle
                      label="Listing tracker"
                      detail="Email me when a new matching listing is added."
                      checked={item.listingTrackerAlertsEnabled}
                      disabled={isPending && pendingAlertId === `${item.id}:listing`}
                      onChange={(checked) => updateAlert(item.id, "listing", checked)}
                    />
                  </div>
                ) : (
                  <p style={styles.publicSavedMeta}>Saved to this public garage</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  function updateAlert(itemId: string, alertType: "price" | "listing", enabled: boolean) {
    setPendingAlertId(`${itemId}:${alertType}`);
    setLocalSavedVehicles((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              priceTrackerAlertsEnabled: alertType === "price" ? enabled : item.priceTrackerAlertsEnabled,
              listingTrackerAlertsEnabled: alertType === "listing" ? enabled : item.listingTrackerAlertsEnabled,
            }
          : item
      )
    );

    startTransition(async () => {
      const result = await toggleGarageAlert(itemId, alertType, enabled);
      if (!result.ok) {
        setLocalSavedVehicles((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  priceTrackerAlertsEnabled: alertType === "price" ? !enabled : item.priceTrackerAlertsEnabled,
                  listingTrackerAlertsEnabled: alertType === "listing" ? !enabled : item.listingTrackerAlertsEnabled,
                }
              : item
          )
        );
      }
      setPendingAlertId(null);
    });
  }
}

function AlertToggle({
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={styles.alertToggle}>
      <span style={styles.alertText}>
        <strong style={styles.alertTitle}>{label}</strong>
        <em style={styles.alertDetail}>{detail}</em>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={styles.alertInput}
      />
      <span style={toggleTrackStyle(checked, disabled)}>
        <span style={toggleKnobStyle(checked)} />
      </span>
    </label>
  );
}

function VehicleImage({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div style={styles.imageWrap}>
      {src ? (
        <Image src={src} alt={alt} fill sizes="(max-width: 720px) 100vw, 33vw" style={styles.image} unoptimized />
      ) : (
        <div style={styles.imageFallback}>SUPERCAR DASH</div>
      )}
    </div>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    ...styles.tab,
    backgroundColor: active ? "rgba(226, 15, 27, 0.95)" : "rgba(255, 255, 255, 0.06)",
    color: "#FFFFFF",
    borderColor: active ? "rgba(226, 15, 27, 0.95)" : "rgba(255, 255, 255, 0.12)",
  };
}

function countStyle(active: boolean): React.CSSProperties {
  return {
    ...styles.count,
    backgroundColor: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
    color: active ? "#FFFFFF" : "rgba(255,255,255,0.72)",
  };
}

function toggleTrackStyle(checked: boolean, disabled: boolean): React.CSSProperties {
  return {
    position: "relative",
    width: "42px",
    height: "24px",
    flex: "0 0 auto",
    borderRadius: "999px",
    backgroundColor: checked ? "#e20f1b" : "rgba(255,255,255,0.2)",
    opacity: disabled ? 0.6 : 1,
    transition: "background-color 160ms ease, opacity 160ms ease",
  };
}

function toggleKnobStyle(checked: boolean): React.CSSProperties {
  return {
    position: "absolute",
    top: "3px",
    left: "3px",
    width: "18px",
    height: "18px",
    borderRadius: "999px",
    backgroundColor: "#FFFFFF",
    boxShadow: "0 1px 2px rgba(16, 24, 40, 0.22)",
    transform: checked ? "translateX(18px)" : "translateX(0)",
    transition: "transform 160ms ease",
  };
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "grid",
    gap: "18px",
    width: "min(1360px, 100%)",
    margin: "0 auto",
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px",
    padding: "6px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    backgroundColor: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(18px)",
  },
  tab: {
    minWidth: 0,
    minHeight: "42px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "0 10px",
    fontSize: "13px",
    fontWeight: 780,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  count: {
    minWidth: "24px",
    minHeight: "22px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 7px",
    fontSize: "12px",
    fontWeight: 850,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
    gap: "14px",
  },
  card: {
    minWidth: 0,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.26)",
  },
  imageWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 10",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  image: {
    objectFit: "cover",
  },
  imageFallback: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    color: "rgba(255,255,255,0.58)",
    fontSize: "12px",
    fontWeight: 850,
    letterSpacing: "1px",
  },
  cardBody: {
    display: "grid",
    gap: "7px",
    padding: "14px",
  },
  kicker: {
    color: "rgba(255,255,255,0.58)",
    fontSize: "11px",
    fontWeight: 850,
    textTransform: "uppercase",
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: "18px",
    fontWeight: 850,
    lineHeight: 1.2,
    margin: 0,
  },
  meta: {
    color: "rgba(255,255,255,0.66)",
    fontSize: "13px",
    lineHeight: 1.4,
    margin: 0,
  },
  mileage: {
    color: "rgba(255,255,255,0.66)",
    fontSize: "12px",
    margin: 0,
  },
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    minWidth: 0,
    marginTop: "4px",
  },
  claimedBadge: {
    flex: "0 0 auto",
    borderRadius: "999px",
    backgroundColor: "rgba(34, 197, 94, 0.16)",
    color: "#86efac",
    padding: "4px 8px",
    fontSize: "11px",
    fontWeight: 850,
  },
  savedBadge: {
    flex: "0 0 auto",
    borderRadius: "999px",
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.82)",
    padding: "4px 8px",
    fontSize: "11px",
    fontWeight: 850,
  },
  vin: {
    minWidth: 0,
    overflow: "hidden",
    color: "rgba(255,255,255,0.58)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "11px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  modelPath: {
    color: "rgba(255,255,255,0.58)",
    fontSize: "12px",
  },
  alertPanel: {
    display: "grid",
    gap: "8px",
    marginTop: "8px",
    paddingTop: "10px",
    borderTop: "1px solid rgba(255,255,255,0.1)",
  },
  alertToggle: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "12px",
    alignItems: "center",
    cursor: "pointer",
  },
  alertText: {
    display: "grid",
    gap: "3px",
    minWidth: 0,
  },
  alertTitle: {
    color: "#FFFFFF",
    fontSize: "13px",
    fontStyle: "normal",
    fontWeight: 820,
  },
  alertDetail: {
    color: "rgba(255,255,255,0.58)",
    fontSize: "12px",
    fontStyle: "normal",
    lineHeight: 1.35,
  },
  alertInput: {
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
  },
  publicSavedMeta: {
    margin: "8px 0 0",
    paddingTop: "10px",
    borderTop: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.58)",
    fontSize: "12px",
    lineHeight: 1.35,
  },
  emptyPanel: {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: "28px",
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: "20px",
    fontWeight: 850,
    margin: "0 0 8px",
  },
  emptyCopy: {
    color: "rgba(255,255,255,0.66)",
    fontSize: "14px",
    lineHeight: 1.5,
    margin: 0,
  },
  emptyLink: {
    display: "inline-flex",
    marginTop: "16px",
    minHeight: "38px",
    alignItems: "center",
    borderRadius: "6px",
    backgroundColor: "#e20f1b",
    color: "#FFFFFF",
    padding: "0 14px",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 800,
  },
};
