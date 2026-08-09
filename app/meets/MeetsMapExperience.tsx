"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { MeetEvent } from "./meet-data";

type MeetsMapExperienceProps = {
  meetEvents: MeetEvent[];
};

type UserLocation = {
  latitude: number;
  longitude: number;
};

const NEARBY_RADIUS_MILES = 250;

export function MeetsMapExperience({ meetEvents }: MeetsMapExperienceProps) {
  const [makeFilter, setMakeFilter] = useState("ALL");
  const [nearMeEnabled, setNearMeEnabled] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState("");

  const makeOptions = useMemo(() => {
    const makes = new Set<string>();
    meetEvents.forEach((meet) => meet.allowedMakes.forEach((make) => makes.add(make)));
    return Array.from(makes).sort((a, b) => a.localeCompare(b));
  }, [meetEvents]);

  const meetsWithDistance = useMemo(
    () =>
      meetEvents.map((meet) => ({
        ...meet,
        distanceMiles:
          userLocation && meet.latitude !== null && meet.longitude !== null
            ? calculateDistanceMiles(userLocation.latitude, userLocation.longitude, meet.latitude, meet.longitude)
            : null,
      })),
    [meetEvents, userLocation],
  );

  const filteredMeets = meetsWithDistance.filter((meet) => {
    if (makeFilter !== "ALL" && !meet.allowedMakes.includes(makeFilter)) return false;
    if (nearMeEnabled && userLocation && meet.distanceMiles !== null) {
      return meet.distanceMiles <= NEARBY_RADIUS_MILES;
    }
    return true;
  });

  const visibleMeets = filteredMeets.length > 0 ? filteredMeets : meetsWithDistance.filter((meet) => {
    if (makeFilter !== "ALL" && !meet.allowedMakes.includes(makeFilter)) return false;
    return true;
  });
  const selectedMeet = visibleMeets[0] ?? meetEvents[0];
  const focusMeet = nearMeEnabled && userLocation
    ? [...meetsWithDistance].filter((meet) => meet.distanceMiles !== null).sort((a, b) => (a.distanceMiles ?? 9999) - (b.distanceMiles ?? 9999))[0]
    : null;
  const focusX = focusMeet?.mapX ?? 50;
  const focusY = focusMeet?.mapY ?? 50;

  function handleNearMe() {
    if (!navigator.geolocation) {
      setLocationStatus("Location is unavailable in this browser.");
      return;
    }

    if (nearMeEnabled) {
      setNearMeEnabled(false);
      setLocationStatus("");
      return;
    }

    setLocationStatus("Finding meets near you...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setNearMeEnabled(true);
        setLocationStatus(`Showing meets within ${NEARBY_RADIUS_MILES} miles.`);
      },
      () => {
        setLocationStatus("Allow location access to filter nearby meets.");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <>
      <div className="meets-filter-strip" aria-label="Meet filters">
        <label>
          <span>Make</span>
          <select value={makeFilter} onChange={(event) => setMakeFilter(event.target.value)}>
            <option value="ALL">All makes</option>
            {makeOptions.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={nearMeEnabled ? "is-active" : undefined} onClick={handleNearMe}>
          <span aria-hidden="true" />
          Near Me
        </button>
        {makeFilter !== "ALL" || nearMeEnabled ? (
          <button
            type="button"
            onClick={() => {
              setMakeFilter("ALL");
              setNearMeEnabled(false);
              setLocationStatus("");
            }}
          >
            Reset
          </button>
        ) : null}
      </div>

      <div
        className={`meets-map-panel ${nearMeEnabled ? "is-focused" : ""}`}
        style={{
          "--meet-focus-x": `${focusX}%`,
          "--meet-focus-y": `${focusY}%`,
        } as CSSProperties}
      >
        <div className="meets-map-canvas">
          <CountryMapGraphic countryCode="US" />
          {visibleMeets.map((meet) => (
            <Link
              key={meet.slug}
              href={`/meets/${meet.slug}`}
              className={`meets-map-pin is-${meet.accent}`}
              style={{ left: `${meet.mapX}%`, top: `${meet.mapY}%` }}
              aria-label={`${meet.title} in ${meet.city}, ${meet.state}`}
            >
              <span />
              <em>{meet.city.toUpperCase()}</em>
            </Link>
          ))}
        </div>

        {filteredMeets.length === 0 && nearMeEnabled ? (
          <div className="meets-map-message">No meets found within {NEARBY_RADIUS_MILES} miles.</div>
        ) : null}

        <article className="meets-selected-card">
          <div className="meets-selected-image" style={{ backgroundImage: `url("${selectedMeet.heroImage}")` }} />
          <div>
            <span>{selectedMeet.type}</span>
            <h2>{selectedMeet.title}</h2>
            <p>
              {selectedMeet.dateLabel} · {selectedMeet.city}, {selectedMeet.state}
              {"distanceMiles" in selectedMeet && typeof selectedMeet.distanceMiles === "number"
                ? ` · ${Math.round(selectedMeet.distanceMiles).toLocaleString()} mi`
                : ""}
            </p>
            <strong>{selectedMeet.expectedCars} cars expected</strong>
            <div className="meets-selected-actions">
              <Link href={`/meets/${selectedMeet.slug}`}>RSVP</Link>
              <Link href={`/meets/${selectedMeet.slug}`} className="is-primary">
                View Meet
              </Link>
            </div>
          </div>
        </article>
      </div>

      {locationStatus ? <p className="meets-location-status">{locationStatus}</p> : null}

      <aside className="meets-upcoming-panel" aria-label="Upcoming meets">
        <div className="meets-panel-title">
          <span>Live Calendar</span>
          <strong>Upcoming Meets</strong>
        </div>
        <div className="meets-upcoming-list">
          {visibleMeets.slice(0, 5).map((meet) => (
            <Link key={meet.slug} href={`/meets/${meet.slug}`} className="meets-upcoming-card">
              <div className="meets-upcoming-image" style={{ backgroundImage: `url("${meet.heroImage}")` }} />
              <div>
                <strong>{meet.title}</strong>
                <span>
                  {meet.dateLabel} · {meet.city}, {meet.state}
                </span>
                <p>{meet.expectedCars} cars expected</p>
              </div>
              <em aria-hidden="true">&gt;</em>
            </Link>
          ))}
        </div>
        <Link href="/meets/host" className="meets-host-button">
          <span aria-hidden="true">+</span>
          Host a Meet
        </Link>
      </aside>
    </>
  );
}

function CountryMapGraphic({ countryCode }: { countryCode: "US" }) {
  const map = countryMapAssets[countryCode];

  return (
    <div className="meets-map-svg meets-real-map" role="img" aria-label={map.label}>
      <span className="meets-real-map-image" aria-hidden="true" style={{ backgroundImage: `url("${map.src}")` }} />
      {map.glows.map(([x, y]) => (
        <span key={`${x}:${y}`} className="meets-map-glow" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
    </div>
  );
}

const countryMapAssets = {
  US: {
    label: "United States meet map",
    src: "/maps/us-contiguous-48.svg",
    glows: [
      [16, 23],
      [18, 60],
      [58, 43],
      [65, 64],
      [69, 58],
      [77, 78],
      [78, 36],
    ] as Array<[number, number]>,
  },
};

function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
