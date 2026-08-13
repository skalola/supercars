"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MakeOption } from "@/lib/makes/catalog";

export type DirectoryVendorType = "DEALER" | "SERVICE_SHOP" | "TRANSPORTER" | "INSURER";

export type DirectoryVendor = {
  id: string;
  name: string;
  type: DirectoryVendorType;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  makeSpecialization: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMiles?: number | null;
};

type DirectoryTabsProps = {
  vendors: DirectoryVendor[];
  makeOptions: MakeOption[];
  activeTab: DirectoryVendorType;
  makeFilter: string;
  locationFilter: string;
  counts: Record<DirectoryVendorType, number>;
};

const tabs: Array<{ id: DirectoryVendorType; label: string }> = [
  { id: "DEALER", label: "Dealer" },
  { id: "SERVICE_SHOP", label: "Service" },
  { id: "TRANSPORTER", label: "Transport" },
  { id: "INSURER", label: "Insurance" },
];

export default function DirectoryTabs({
  vendors,
  makeOptions,
  activeTab,
  makeFilter,
  locationFilter,
  counts,
}: DirectoryTabsProps) {
  const router = useRouter();
  const [location, setLocation] = useState(locationFilter);
  const [locationMessage, setLocationMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  const updateFilters = (changes: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search);
    params.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/admin/partners?${params.toString()}`);
  };

  const applyCoordinates = (latitude: number, longitude: number, label: string) => {
    updateFilters({
      location: label,
      lat: String(latitude),
      lng: String(longitude),
    });
  };

  const handleLocationSearch = async () => {
    const query = location.trim();
    if (!query) {
      setLocationMessage("");
      updateFilters({ location: "", lat: "", lng: "" });
      return;
    }

    setIsLocating(true);
    setLocationMessage("Looking up location...");
    try {
      const response = await fetch(`/api/location/geocode?q=${encodeURIComponent(query)}`);
      const data = await response.json() as {
        result?: { label: string; latitude: number; longitude: number } | null;
      };
      if (data.result) {
        setLocation(data.result.label);
        applyCoordinates(data.result.latitude, data.result.longitude, data.result.label);
        setLocationMessage(`Showing vendors within 100 miles of ${data.result.label}.`);
      } else {
        updateFilters({ location: query, lat: "", lng: "" });
        setLocationMessage("Showing matching directory locations.");
      }
    } catch {
      setLocationMessage("Location lookup is unavailable. Try a city, state, or ZIP code.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Location sorting is unavailable in this browser.");
      return;
    }
    setIsLocating(true);
    setLocationMessage("Checking your location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation("Current location");
        applyCoordinates(position.coords.latitude, position.coords.longitude, "Current location");
        setLocationMessage("Showing vendors within 100 miles of your location.");
        setIsLocating(false);
      },
      () => {
        setLocationMessage("Location permission was not granted.");
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  return (
    <section className="surface-panel directory-panel">
      <div className="directory-tabs" role="tablist" aria-label="Vendor directory categories">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`directory-tab${isActive ? " is-active" : ""}`}
              onClick={() => updateFilters({ type: tab.id })}
            >
              <span>{tab.label}</span>
              <strong>{counts[tab.id]}</strong>
            </button>
          );
        })}
      </div>

      <div className="directory-controls">
        <label>
          <span>Make</span>
          <select value={makeFilter} onChange={(event) => updateFilters({ make: event.target.value })}>
            <option value="ALL">All makes</option>
            {makeOptions.map((make) => (
              <option key={make.id} value={make.name}>{make.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Location</span>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleLocationSearch();
              }
            }}
            placeholder="Zip, city, or state"
          />
        </label>
        <button type="button" onClick={() => void handleLocationSearch()} disabled={isLocating}>
          {isLocating ? "Searching..." : "Search"}
        </button>
        <button type="button" onClick={handleUseLocation} disabled={isLocating}>
          Closest to me
        </button>
      </div>
      {locationMessage ? <div className="directory-location-message">{locationMessage}</div> : null}

      <div className="directory-table" role="table" aria-label={`${getTabLabel(activeTab)} vendors`}>
        <div className="directory-row directory-header-row" role="row">
          <div role="columnheader">Name</div>
          <div role="columnheader">Location</div>
          <div role="columnheader">Phone</div>
          <div role="columnheader">Email</div>
        </div>

        {vendors.length === 0 ? (
          <div className="directory-empty">
            No {getTabLabel(activeTab).toLowerCase()} vendors match these filters.
          </div>
        ) : vendors.map((vendor) => (
          <div key={vendor.id} className="directory-row" role="row">
            <div className="directory-cell directory-name-cell" role="cell" data-label="Name">
              <strong>{vendor.name}</strong>
              <span>{vendor.makeSpecialization || "All makes"}</span>
              {vendor.distanceMiles !== null && vendor.distanceMiles !== undefined ? (
                <span>{Math.round(vendor.distanceMiles).toLocaleString()} miles away</span>
              ) : null}
              {vendor.website ? <a href={vendor.website} target="_blank" rel="noopener noreferrer">Website</a> : null}
            </div>
            <div className="directory-cell" role="cell" data-label="Location">{formatVendorLocation(vendor)}</div>
            <div className="directory-cell" role="cell" data-label="Phone">{vendor.phone || "Not published"}</div>
            <div className="directory-cell" role="cell" data-label="Email">
              {vendor.email ? <a href={`mailto:${vendor.email}`}>{vendor.email}</a> : "Not published"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatVendorLocation(vendor: DirectoryVendor) {
  return [vendor.city, vendor.state].filter(Boolean).join(", ") || vendor.address || "Not published";
}

function getTabLabel(type: DirectoryVendorType) {
  return tabs.find((tab) => tab.id === type)?.label || "Directory";
}
