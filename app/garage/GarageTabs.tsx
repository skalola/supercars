"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { removeClaimedVehicle, removeSavedGarageItem, toggleGarageAlert } from "@/app/actions/garage";

export type GarageClaimedVehicle = {
  id: string;
  vin: string;
  year: number;
  status: string;
  mileage: number | null;
  image: string | null;
  makeLogoUrl: string | null;
  makeName: string;
  makeSlug: string;
  modelName: string;
  modelSlug: string;
  trim: string | null;
  estimatedValue: number | null;
};

export type GarageSavedVehicle = {
  id: string;
  image: string | null;
  makeLogoUrl: string | null;
  makeName: string;
  makeSlug: string;
  modelName: string;
  modelSlug: string;
  years: string | null;
  priceTrackerAlertsEnabled: boolean;
  listingTrackerAlertsEnabled: boolean;
};

export type GaragePreviousVehicle = {
  id: string;
  vin: string;
  year: number;
  status: string;
  mileage: number | null;
  image: string | null;
  makeLogoUrl: string | null;
  makeName: string;
  makeSlug: string;
  modelName: string;
  modelSlug: string;
  trim: string | null;
  estimatedValue: number | null;
};

type GarageTabsProps = {
  claimedVehicles: GarageClaimedVehicle[];
  savedVehicles: GarageSavedVehicle[];
  previousVehicles?: GaragePreviousVehicle[];
  isOwner?: boolean;
};

type ActiveTab = "claimed" | "saved" | "previouslyOwned";
type PendingRemoval =
  | { kind: "claimed"; id: string; label: string }
  | { kind: "saved"; id: string; label: string };

export default function GarageTabs({ claimedVehicles, savedVehicles, previousVehicles = [], isOwner = true }: GarageTabsProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(claimedVehicles.length > 0 || savedVehicles.length === 0 ? "claimed" : "saved");
  const [localClaimedVehicles, setLocalClaimedVehicles] = useState(claimedVehicles);
  const [localSavedVehicles, setLocalSavedVehicles] = useState(savedVehicles);
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [collectionPage, setCollectionPage] = useState(0);
  const pageSize = useGarageCollectionPageSize();
  const [isPending, startTransition] = useTransition();
  const previouslyOwnedCount = previousVehicles.length;
  const activeCount =
    activeTab === "claimed"
      ? localClaimedVehicles.length
      : activeTab === "saved"
        ? localSavedVehicles.length
        : previouslyOwnedCount;
  const pageCount = Math.max(1, Math.ceil(activeCount / pageSize));
  const activePage = Math.min(collectionPage, pageCount - 1);
  const visibleClaimedVehicles = localClaimedVehicles.slice(activePage * pageSize, activePage * pageSize + pageSize);
  const visibleSavedVehicles = localSavedVehicles.slice(activePage * pageSize, activePage * pageSize + pageSize);
  const visiblePreviousVehicles = previousVehicles.slice(activePage * pageSize, activePage * pageSize + pageSize);

  return (
    <section className="garage-collection-shell">
      <div role="tablist" aria-label="Garage vehicle categories" className="garage-collection-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "claimed"}
          onClick={() => selectTab("claimed")}
          className={activeTab === "claimed" ? "is-active" : undefined}
        >
          <span>Claimed</span>
          <strong>{localClaimedVehicles.length}</strong>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "saved"}
          onClick={() => selectTab("saved")}
          className={activeTab === "saved" ? "is-active" : undefined}
        >
          <span>Dream Garage</span>
          <strong>{localSavedVehicles.length}</strong>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "previouslyOwned"}
          onClick={() => selectTab("previouslyOwned")}
          className={activeTab === "previouslyOwned" ? "is-active" : undefined}
        >
          <span>Previously Owned</span>
          <strong>{previouslyOwnedCount}</strong>
        </button>
      </div>

      {activeCount === 0 ? (
        <div className="garage-collection-empty">
          <div className="garage-collection-empty-mark" aria-hidden="true">SD</div>
          <div>
            <h2>{getEmptyTitle(activeTab)}</h2>
            <p>{getEmptyCopy(activeTab)}</p>
          </div>
          <Link href={getEmptyActionHref(activeTab)}>{getEmptyActionLabel(activeTab)}</Link>
        </div>
      ) : activeTab === "claimed" ? (
        <div className="garage-collection-grid">
          {visibleClaimedVehicles.map((vehicle) => (
            <article key={vehicle.id} className="garage-vehicle-card">
              {isOwner ? (
                <button
                  type="button"
                  className="garage-card-remove-button"
                  aria-label={`Remove ${vehicle.year} ${vehicle.makeName} ${vehicle.modelName} from claimed garage`}
                  disabled={removingId === vehicle.id}
                  onClick={() => setPendingRemoval({ kind: "claimed", id: vehicle.id, label: `${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}` })}
                >
                  ×
                </button>
              ) : null}
              <Link href={`/vehicle/${vehicle.vin}`} className="clean-link garage-card-main-link">
                <VehicleImage src={vehicle.image} alt={`${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}`}>
                  <span className="garage-card-vin-overlay">
                    <span aria-hidden="true" />
                    {vehicle.status === "CLAIMED" ? "VIN Verified" : "Claim Pending"}
                  </span>
                </VehicleImage>
                <div className="garage-card-body">
                  <div className="garage-card-identity">
                    <MakeMark src={vehicle.makeLogoUrl} label={vehicle.makeName} />
                    <div>
                      <span>
                        {vehicle.year} {vehicle.makeName}
                      </span>
                      <strong>{vehicle.modelName}</strong>
                      {getDisplayTrim(vehicle.trim) ? <em>{getDisplayTrim(vehicle.trim)}</em> : null}
                    </div>
                  </div>
                  <div className="garage-card-meta-grid">
                    <span>
                      <em>Est. Value</em>
                      <strong>{formatMoney(vehicle.estimatedValue)}</strong>
                    </span>
                    <span>
                      <em>Mileage</em>
                      <strong>{vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} mi` : "Pending"}</strong>
                    </span>
                  </div>
                </div>
              </Link>
              <div className="garage-card-actions-row">
                <Link href={`/vehicle/${vehicle.vin}`}>
                  <ActionIcon kind="details" />
                  View Details
                </Link>
                <Link href={`/vehicle/${vehicle.vin}#service`}>
                  <ActionIcon kind="service" />
                  Service
                </Link>
                <button type="button" onClick={() => shareVehicle(vehicle.vin)}>
                  <ActionIcon kind="share" />
                  Share
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : activeTab === "saved" ? (
        <div className="garage-collection-grid">
          {visibleSavedVehicles.map((item) => (
            <article key={item.id} className="garage-vehicle-card is-dream">
              {isOwner ? (
                <button
                  type="button"
                  className="garage-card-remove-button"
                  aria-label={`Remove ${item.makeName} ${item.modelName} from dream garage`}
                  disabled={removingId === item.id}
                  onClick={() => setPendingRemoval({ kind: "saved", id: item.id, label: `${item.makeName} ${item.modelName}` })}
                >
                  ×
                </button>
              ) : null}
              <Link href={`/make/${item.makeSlug}/${item.modelSlug}`} className="clean-link garage-card-main-link">
                <VehicleImage src={item.image} alt={`${item.makeName} ${item.modelName}`} />
                <div className="garage-card-body">
                  <div className="garage-card-identity">
                    <MakeMark src={item.makeLogoUrl} label={item.makeName} />
                    <div>
                      <span>{item.makeName}</span>
                      <strong>{item.modelName}</strong>
                      {item.years ? <em>{item.years}</em> : null}
                    </div>
                  </div>
                  <div className="garage-card-meta-grid">
                    <span>
                      <em>Years</em>
                      <strong>{item.years || "Pending"}</strong>
                    </span>
                    <span>
                      <em>Trackers</em>
                      <strong>{formatTrackerCount(item)}</strong>
                    </span>
                  </div>
                </div>
              </Link>
              <div className="garage-card-body garage-card-alert-body">
                {isOwner ? (
                  <div className="garage-alert-panel" aria-label={`${item.makeName} ${item.modelName} alerts`}>
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
                  <p className="garage-public-saved-meta">Saved to this public garage</p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : activeTab === "previouslyOwned" ? (
        <div className="garage-collection-grid">
          {visiblePreviousVehicles.map((vehicle) => (
            <article key={vehicle.id} className="garage-vehicle-card is-previous">
              <Link href={`/vehicle/${vehicle.vin}`} className="clean-link garage-card-main-link">
                <VehicleImage src={vehicle.image} alt={`${vehicle.year} ${vehicle.makeName} ${vehicle.modelName}`}>
                  <span className="garage-card-history-overlay">{formatVehicleStatus(vehicle.status)}</span>
                </VehicleImage>
                <div className="garage-card-body">
                  <div className="garage-card-identity">
                    <MakeMark src={vehicle.makeLogoUrl} label={vehicle.makeName} />
                    <div>
                      <span>
                        {vehicle.year} {vehicle.makeName}
                      </span>
                      <strong>{vehicle.modelName}</strong>
                      {getDisplayTrim(vehicle.trim) ? <em>{getDisplayTrim(vehicle.trim)}</em> : null}
                    </div>
                  </div>
                  <div className="garage-card-meta-grid">
                    <span>
                      <em>Est. Value</em>
                      <strong>{formatMoney(vehicle.estimatedValue)}</strong>
                    </span>
                    <span>
                      <em>Mileage</em>
                      <strong>{vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} mi` : "Archived"}</strong>
                    </span>
                  </div>
                </div>
              </Link>
              <div className="garage-card-actions-row">
                <Link href={`/vehicle/${vehicle.vin}`}>
                  <ActionIcon kind="details" />
                  View Details
                </Link>
                <Link href={`/make/${vehicle.makeSlug}/${vehicle.modelSlug}`}>
                  <ActionIcon kind="details" />
                  Model
                </Link>
                <button type="button" onClick={() => shareVehicle(vehicle.vin)}>
                  <ActionIcon kind="share" />
                  Share
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {activeCount > pageSize ? (
        <GarageCarouselControls
          activePage={activePage}
          pageCount={pageCount}
          onPrevious={() => setCollectionPage((current) => (Math.min(current, pageCount - 1) === 0 ? pageCount - 1 : Math.min(current, pageCount - 1) - 1))}
          onNext={() => setCollectionPage((current) => (Math.min(current, pageCount - 1) + 1) % pageCount)}
          onSelect={setCollectionPage}
        />
      ) : null}
      {pendingRemoval ? (
        <div className="garage-remove-modal" role="dialog" aria-modal="true" aria-labelledby="garage-remove-title">
          <div className="garage-remove-modal-panel">
            <h2 id="garage-remove-title">Remove car?</h2>
            <p>
              Are you sure you want to remove {pendingRemoval.label} from your{" "}
              {pendingRemoval.kind === "claimed" ? "claimed garage" : "dream garage"}?
            </p>
            <div className="garage-remove-modal-actions">
              <button type="button" className="garage-remove-modal-secondary" disabled={Boolean(removingId)} onClick={() => setPendingRemoval(null)}>
                Keep Car
              </button>
              <button type="button" className="garage-remove-modal-danger" disabled={Boolean(removingId)} onClick={confirmRemoval}>
                {removingId ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );

  function selectTab(tab: ActiveTab) {
    setActiveTab(tab);
    setCollectionPage(0);
  }

  function confirmRemoval() {
    if (!pendingRemoval) return;
    const removal = pendingRemoval;
    setRemovingId(removal.id);

    if (removal.kind === "claimed") {
      const previous = localClaimedVehicles;
      setLocalClaimedVehicles((current) => current.filter((vehicle) => vehicle.id !== removal.id));
      startTransition(async () => {
        const result = await removeClaimedVehicle(removal.id);
        if (!result.ok) setLocalClaimedVehicles(previous);
        setPendingRemoval(null);
        setRemovingId(null);
      });
      return;
    }

    const previous = localSavedVehicles;
    setLocalSavedVehicles((current) => current.filter((item) => item.id !== removal.id));
    startTransition(async () => {
      const result = await removeSavedGarageItem(removal.id);
      if (!result.ok) setLocalSavedVehicles(previous);
      setPendingRemoval(null);
      setRemovingId(null);
    });
  }

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

function useGarageCollectionPageSize() {
  const [pageSize, setPageSize] = useState(3);

  useEffect(() => {
    function updatePageSize() {
      if (window.innerWidth <= 720) {
        setPageSize(1);
        return;
      }

      if (window.innerWidth <= 1180) {
        setPageSize(2);
        return;
      }

      setPageSize(3);
    }

    updatePageSize();
    window.addEventListener("resize", updatePageSize);
    return () => window.removeEventListener("resize", updatePageSize);
  }, []);

  return pageSize;
}

function GarageCarouselControls({
  activePage,
  pageCount,
  onPrevious,
  onNext,
  onSelect,
}: {
  activePage: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (page: number) => void;
}) {
  const pages = getVisibleCarouselPages(activePage, pageCount);

  return (
    <div className="garage-carousel-controls" aria-label="Garage carousel controls">
      <button type="button" className="garage-carousel-arrow" aria-label="Previous garage cars" onClick={onPrevious}>
        <span aria-hidden="true" />
      </button>
      <div className="garage-carousel-dots" aria-label="Garage carousel pages">
        {pages.map((page, index) =>
          page === "gap" ? (
            <span key={`gap-${index}`} className="garage-carousel-gap" aria-hidden="true" />
          ) : (
            <button
              key={page}
              type="button"
              aria-label={`Show garage page ${page + 1}`}
              aria-current={activePage === page ? "true" : undefined}
              className={activePage === page ? "is-active" : undefined}
              onClick={() => onSelect(page)}
            />
          ),
        )}
      </div>
      <button type="button" className="garage-carousel-arrow is-next" aria-label="Next garage cars" onClick={onNext}>
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

function getVisibleCarouselPages(activePage: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index);

  const pages = new Set([0, pageCount - 1, activePage - 1, activePage, activePage + 1]);
  const sortedPages = [...pages]
    .filter((page) => page >= 0 && page < pageCount)
    .sort((a, b) => a - b);

  return sortedPages.flatMap((page, index) => {
    const previous = sortedPages[index - 1];
    if (index > 0 && previous !== undefined && page - previous > 1) return ["gap", page];
    return [page];
  });
}

function getEmptyTitle(activeTab: ActiveTab) {
  if (activeTab === "claimed") return "No claimed vehicles yet";
  if (activeTab === "saved") return "No dream cars yet";
  return "No previously owned vehicles yet";
}

function getEmptyCopy(activeTab: ActiveTab) {
  if (activeTab === "claimed") {
    return "Claim a VIN-backed vehicle passport to manage ownership, service, and selling workflows.";
  }

  if (activeTab === "saved") {
    return "Save supported models from the market to build your dream garage.";
  }

  return "Cars no longer marked as actively claimed will appear here when ownership history is retained.";
}

function getEmptyActionHref(activeTab: ActiveTab) {
  if (activeTab === "claimed") return "/claim";
  if (activeTab === "saved") return "/makes";
  return "/inventory";
}

function getEmptyActionLabel(activeTab: ActiveTab) {
  if (activeTab === "claimed") return "Claim Car";
  if (activeTab === "saved") return "Browse Makes";
  return "Browse Market";
}

function formatTrackerCount(item: GarageSavedVehicle) {
  const count = Number(item.priceTrackerAlertsEnabled) + Number(item.listingTrackerAlertsEnabled);
  if (count === 0) return "Off";
  return `${count} active`;
}

function formatVehicleStatus(status: string) {
  if (!status || status === "UNCLAIMED") return "Previously Owned";
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDisplayTrim(trim: string | null) {
  if (!trim) return null;
  const normalized = trim.toLowerCase();
  if (normalized.includes("[admin test]") || normalized.includes("admin test") || normalized.includes(" qa")) return null;
  return trim;
}

function formatMoney(value: number | null) {
  if (!value || value <= 0) return "Pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function ActionIcon({ kind }: { kind: "details" | "service" | "share" }) {
  return <span className={`garage-card-action-icon is-${kind}`} aria-hidden="true" />;
}

function shareVehicle(vin: string) {
  const href = `${window.location.origin}/vehicle/${vin}`;
  if (navigator.share) {
    void navigator.share({ title: "SUPERCAR DASH vehicle", url: href });
    return;
  }
  void navigator.clipboard?.writeText(href);
}

function MakeMark({ src, label }: { src: string | null; label: string }) {
  return (
    <span className="garage-card-make-mark" aria-hidden="true">
      {src ? <Image src={src} alt="" width={34} height={34} unoptimized /> : label.slice(0, 2).toUpperCase()}
    </span>
  );
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
    <label className="garage-alert-toggle">
      <span className="garage-alert-text">
        <strong>{label}</strong>
        <em>{detail}</em>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="garage-alert-track" data-checked={checked ? "true" : "false"} data-disabled={disabled ? "true" : "false"}>
        <span />
      </span>
    </label>
  );
}

function VehicleImage({ src, alt, children }: { src: string | null; alt: string; children?: ReactNode }) {
  return (
    <div className="garage-card-image">
      {src ? (
        <Image src={src} alt={alt} fill sizes="(max-width: 720px) 100vw, 33vw" unoptimized />
      ) : (
        <div className="garage-card-image-fallback">SUPERCAR DASH</div>
      )}
      {children}
    </div>
  );
}
