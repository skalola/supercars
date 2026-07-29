"use client";

import { useEffect, useMemo, useState } from "react";

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
};

type DirectoryTabsProps = {
  vendors: DirectoryVendor[];
};

const tabs: Array<{ id: DirectoryVendorType; label: string }> = [
  { id: "DEALER", label: "Dealer" },
  { id: "SERVICE_SHOP", label: "Service" },
  { id: "TRANSPORTER", label: "Transport" },
  { id: "INSURER", label: "Insurance" },
];

export default function DirectoryTabs({ vendors }: DirectoryTabsProps) {
  const [activeTab, setActiveTab] = useState<DirectoryVendorType>("DEALER");
  const [makeFilter, setMakeFilter] = useState("ALL");
  const [locationFilter, setLocationFilter] = useState("");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocodedLocation, setGeocodedLocation] = useState<ResolvedLocation | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const localLocation = useMemo(() => resolveLocalDirectoryLocation(locationFilter), [locationFilter]);
  const typedLocation = localLocation || geocodedLocation;
  const sortLocation = typedLocation?.coordinates || userLocation;
  const normalizedLocationFilter = normalize(locationFilter);

  useEffect(() => {
    const query = locationFilter.trim();
    setGeocodedLocation(null);

    if (!query || localLocation) {
      setIsGeocoding(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsGeocoding(true);
      try {
        const response = await fetch(`/api/location/geocode?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await response.json() as {
          result?: {
            label: string;
            latitude: number;
            longitude: number;
          } | null;
        };

        if (data.result) {
          setGeocodedLocation({
            label: data.result.label,
            coordinates: {
              latitude: data.result.latitude,
              longitude: data.result.longitude,
            },
          });
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLocationMessage("Location lookup is unavailable. Try a city, state, or the closest-to-me option.");
        }
      } finally {
        setIsGeocoding(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [locationFilter, localLocation]);

  const counts = useMemo(() => {
    return tabs.reduce<Record<DirectoryVendorType, number>>((acc, tab) => {
      acc[tab.id] = vendors.filter((vendor) => {
        if (vendor.type !== tab.id) return false;
        return makeMatches(vendor, makeFilter);
      }).length;
      return acc;
    }, {
      DEALER: 0,
      SERVICE_SHOP: 0,
      TRANSPORTER: 0,
      INSURER: 0,
    });
  }, [makeFilter, vendors]);

  const visibleVendors = vendors
    .filter((vendor) => {
      if (vendor.type !== activeTab) return false;
      if (!makeMatches(vendor, makeFilter)) return false;

      if (!normalizedLocationFilter || typedLocation || isLikelyLocationQuery(locationFilter)) return true;

      return [vendor.address, vendor.state, vendor.name]
        .filter(Boolean)
        .some((value) => normalize(String(value)).includes(normalizedLocationFilter));
    })
    .map((vendor) => ({
      ...vendor,
      distanceMiles: sortLocation && vendor.latitude !== null && vendor.longitude !== null
        ? calculateDistanceMiles(sortLocation.latitude, sortLocation.longitude, vendor.latitude, vendor.longitude)
        : null,
    }))
    .filter((vendor) => {
      if (!sortLocation) return true;
      return vendor.distanceMiles !== null && vendor.distanceMiles <= 100;
    })
    .sort((a, b) => {
      if (a.distanceMiles !== null && b.distanceMiles !== null) return a.distanceMiles - b.distanceMiles;
      if (a.distanceMiles !== null) return -1;
      if (b.distanceMiles !== null) return 1;
      return a.name.localeCompare(b.name);
    });

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Location sorting is unavailable in this browser.");
      return;
    }

    setLocationMessage("Checking your location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationMessage("Sorted by closest available location.");
      },
      () => {
        setLocationMessage("Location permission was not granted.");
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
              onClick={() => setActiveTab(tab.id)}
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
          <select value={makeFilter} onChange={(event) => setMakeFilter(event.target.value)}>
            <option value="ALL">All makes</option>
            <option value="Ferrari">Ferrari</option>
            <option value="Lamborghini">Lamborghini</option>
          </select>
        </label>
        <label>
          <span>Location</span>
          <input
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
            placeholder="Zip, city, or state"
          />
        </label>
        <button type="button" onClick={handleUseLocation}>
          Closest to me
        </button>
      </div>
      {typedLocation ? (
        <div className="directory-location-message">
          Showing nearest vendors to {typedLocation.label}.
        </div>
      ) : null}
      {isGeocoding ? <div className="directory-location-message">Looking up location...</div> : null}
      {locationMessage ? <div className="directory-location-message">{locationMessage}</div> : null}

      <div className="directory-table" role="table" aria-label={`${getTabLabel(activeTab)} vendors`}>
        <div className="directory-row directory-header-row" role="row">
          <div role="columnheader">Name</div>
          <div role="columnheader">Location</div>
          <div role="columnheader">Phone</div>
          <div role="columnheader">Email</div>
        </div>

        {visibleVendors.length === 0 ? (
          <div className="directory-empty">
            {sortLocation
              ? `No ${getTabLabel(activeTab).toLowerCase()} vendors found within 100 miles.`
              : `No ${getTabLabel(activeTab).toLowerCase()} vendors are registered yet.`}
          </div>
        ) : (
          visibleVendors.map((vendor) => (
            <div key={vendor.id} className="directory-row" role="row">
              <div className="directory-cell directory-name-cell" role="cell" data-label="Name">
                <strong>{vendor.name}</strong>
                <span>{vendor.makeSpecialization || "All makes"}</span>
                {vendor.distanceMiles !== null ? (
                  <span>{Math.round(vendor.distanceMiles).toLocaleString()} miles away</span>
                ) : null}
                {vendor.website ? (
                  <a href={vendor.website} target="_blank" rel="noopener noreferrer">
                    Website
                  </a>
                ) : null}
              </div>
              <div className="directory-cell" role="cell" data-label="Location">
                {formatVendorLocation(vendor)}
              </div>
              <div className="directory-cell" role="cell" data-label="Phone">
                {vendor.phone || "Not published"}
              </div>
              <div className="directory-cell" role="cell" data-label="Email">
                {vendor.email ? (
                  <a href={`mailto:${vendor.email}`}>{vendor.email}</a>
                ) : (
                  "Not published"
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function makeMatches(vendor: DirectoryVendor, makeFilter: string) {
  return makeFilter === "ALL" || vendor.makeSpecialization === "ALL" || vendor.makeSpecialization === makeFilter;
}

function formatVendorLocation(vendor: DirectoryVendor) {
  return [vendor.city, vendor.state].filter(Boolean).join(", ") || vendor.address || "Not published";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

type ResolvedLocation = {
  label: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
};

function resolveLocalDirectoryLocation(value: string): ResolvedLocation | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = normalize(trimmed);
  if (/\b\d{5}\b/.test(trimmed)) {
    return null;
  }

  const stateCode = stateAliases[normalized];
  if (stateCode && stateCenters[stateCode]) {
    return {
      label: stateNames[stateCode],
      coordinates: stateCenters[stateCode],
    };
  }

  const cityMatch = citySearchIndex[normalized];
  if (cityMatch) {
    return cityMatch;
  }

  return null;
}

function isLikelyLocationQuery(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/\b\d{5}\b/.test(trimmed)) return true;
  const normalized = normalize(trimmed);
  return Boolean(stateAliases[normalized]);
}

function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

const stateNames: Record<string, string> = {
  CA: "California",
  CT: "Connecticut",
  FL: "Florida",
  GA: "Georgia",
  IL: "Illinois",
  MI: "Michigan",
  MO: "Missouri",
  NJ: "New Jersey",
  NY: "New York",
  PA: "Pennsylvania",
  TX: "Texas",
  VA: "Virginia",
  NC: "North Carolina",
};

const stateAliases: Record<string, keyof typeof stateNames> = Object.entries(stateNames).reduce(
  (acc, [code, name]) => {
    acc[normalize(code)] = code as keyof typeof stateNames;
    acc[normalize(name)] = code as keyof typeof stateNames;
    return acc;
  },
  {} as Record<string, keyof typeof stateNames>,
);

const stateCenters: Record<string, { latitude: number; longitude: number }> = {
  CA: { latitude: 36.7783, longitude: -119.4179 },
  CT: { latitude: 41.6032, longitude: -73.0877 },
  FL: { latitude: 27.6648, longitude: -81.5158 },
  GA: { latitude: 32.1656, longitude: -82.9001 },
  IL: { latitude: 40.6331, longitude: -89.3985 },
  MI: { latitude: 44.3148, longitude: -85.6024 },
  MO: { latitude: 37.9643, longitude: -91.8318 },
  NJ: { latitude: 40.0583, longitude: -74.4057 },
  NY: { latitude: 43.2994, longitude: -74.2179 },
  PA: { latitude: 41.2033, longitude: -77.1945 },
  TX: { latitude: 31.9686, longitude: -99.9018 },
  VA: { latitude: 37.4316, longitude: -78.6569 },
  NC: { latitude: 35.7596, longitude: -79.0193 },
};

const citySearchIndex: Record<string, { label: string; coordinates: { latitude: number; longitude: number } }> = {
  atlanta: { label: "Atlanta, GA", coordinates: { latitude: 33.749, longitude: -84.388 } },
  atlantaga: { label: "Atlanta, GA", coordinates: { latitude: 33.749, longitude: -84.388 } },
  austin: { label: "Austin, TX", coordinates: { latitude: 30.2672, longitude: -97.7431 } },
  austintx: { label: "Austin, TX", coordinates: { latitude: 30.2672, longitude: -97.7431 } },
  beverlyhills: { label: "Beverly Hills, CA", coordinates: { latitude: 34.0736, longitude: -118.4004 } },
  beverlyhillsca: { label: "Beverly Hills, CA", coordinates: { latitude: 34.0736, longitude: -118.4004 } },
  chicago: { label: "Chicago, IL", coordinates: { latitude: 41.8781, longitude: -87.6298 } },
  chicagoil: { label: "Chicago, IL", coordinates: { latitude: 41.8781, longitude: -87.6298 } },
  charlotte: { label: "Charlotte, NC", coordinates: { latitude: 35.2271, longitude: -80.8431 } },
  charlottenc: { label: "Charlotte, NC", coordinates: { latitude: 35.2271, longitude: -80.8431 } },
  dallas: { label: "Dallas, TX", coordinates: { latitude: 32.7767, longitude: -96.797 } },
  dallastx: { label: "Dallas, TX", coordinates: { latitude: 32.7767, longitude: -96.797 } },
  detroit: { label: "Detroit, MI", coordinates: { latitude: 42.3314, longitude: -83.0458 } },
  detroitmi: { label: "Detroit, MI", coordinates: { latitude: 42.3314, longitude: -83.0458 } },
  fortlauderdale: { label: "Fort Lauderdale, FL", coordinates: { latitude: 26.1224, longitude: -80.1373 } },
  fortlauderdalefl: { label: "Fort Lauderdale, FL", coordinates: { latitude: 26.1224, longitude: -80.1373 } },
  greenwich: { label: "Greenwich, CT", coordinates: { latitude: 41.0262, longitude: -73.6282 } },
  greenwichct: { label: "Greenwich, CT", coordinates: { latitude: 41.0262, longitude: -73.6282 } },
  houston: { label: "Houston, TX", coordinates: { latitude: 29.7604, longitude: -95.3698 } },
  houstontx: { label: "Houston, TX", coordinates: { latitude: 29.7604, longitude: -95.3698 } },
  losangeles: { label: "Los Angeles, CA", coordinates: { latitude: 34.0522, longitude: -118.2437 } },
  losangelesca: { label: "Los Angeles, CA", coordinates: { latitude: 34.0522, longitude: -118.2437 } },
  miami: { label: "Miami, FL", coordinates: { latitude: 25.7617, longitude: -80.1918 } },
  miamifl: { label: "Miami, FL", coordinates: { latitude: 25.7617, longitude: -80.1918 } },
  newyork: { label: "New York, NY", coordinates: { latitude: 40.7128, longitude: -74.006 } },
  newyorkny: { label: "New York, NY", coordinates: { latitude: 40.7128, longitude: -74.006 } },
  newportbeach: { label: "Newport Beach, CA", coordinates: { latitude: 33.6189, longitude: -117.9298 } },
  newportbeachca: { label: "Newport Beach, CA", coordinates: { latitude: 33.6189, longitude: -117.9298 } },
  orangecounty: { label: "Orange County, CA", coordinates: { latitude: 33.7175, longitude: -117.8311 } },
  orangecountyca: { label: "Orange County, CA", coordinates: { latitude: 33.7175, longitude: -117.8311 } },
  palmbeach: { label: "Palm Beach, FL", coordinates: { latitude: 26.7056, longitude: -80.0364 } },
  palmbeachfl: { label: "Palm Beach, FL", coordinates: { latitude: 26.7056, longitude: -80.0364 } },
  paramus: { label: "Paramus, NJ", coordinates: { latitude: 40.9445, longitude: -74.0754 } },
  paramusnj: { label: "Paramus, NJ", coordinates: { latitude: 40.9445, longitude: -74.0754 } },
  philadelphia: { label: "Philadelphia, PA", coordinates: { latitude: 39.9526, longitude: -75.1652 } },
  philadelphiapa: { label: "Philadelphia, PA", coordinates: { latitude: 39.9526, longitude: -75.1652 } },
  redwoodcity: { label: "Redwood City, CA", coordinates: { latitude: 37.4852, longitude: -122.2364 } },
  redwoodcityca: { label: "Redwood City, CA", coordinates: { latitude: 37.4852, longitude: -122.2364 } },
  sanfrancisco: { label: "San Francisco, CA", coordinates: { latitude: 37.7749, longitude: -122.4194 } },
  sanfranciscoca: { label: "San Francisco, CA", coordinates: { latitude: 37.7749, longitude: -122.4194 } },
  sanjose: { label: "San Jose, CA", coordinates: { latitude: 37.3382, longitude: -121.8863 } },
  sanjoseca: { label: "San Jose, CA", coordinates: { latitude: 37.3382, longitude: -121.8863 } },
  washington: { label: "Washington, DC", coordinates: { latitude: 38.9072, longitude: -77.0369 } },
  washingtondc: { label: "Washington, DC", coordinates: { latitude: 38.9072, longitude: -77.0369 } },
  westpalmbeach: { label: "West Palm Beach, FL", coordinates: { latitude: 26.7153, longitude: -80.0534 } },
  westpalmbeachfl: { label: "West Palm Beach, FL", coordinates: { latitude: 26.7153, longitude: -80.0534 } },
};

function getTabLabel(type: DirectoryVendorType) {
  switch (type) {
    case "SERVICE_SHOP":
      return "Service";
    case "TRANSPORTER":
      return "Transport";
    case "INSURER":
      return "Insurance";
    default:
      return "Dealer";
  }
}
