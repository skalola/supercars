"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createServiceBookingPackage } from "@/app/actions/passport";

type ServiceRule = {
  serviceName: string;
  description?: string | null;
};

type ServiceShop = {
  id: string;
  name: string;
  email: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
};

type ServiceBookingModuleProps = {
  vin: string;
  makeName: string;
  defaultRule: ServiceRule | null;
  serviceShops: ServiceShop[];
};

export default function ServiceBookingModule({
  vin,
  makeName,
  defaultRule,
  serviceShops,
}: ServiceBookingModuleProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedShop, setSelectedShop] = useState("");
  const [userCoordinates, setUserCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("10:00 AM");
  const [submitting, setSubmitting] = useState(false);
  const [transactionToken, setTransactionToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bookingRule = defaultRule ?? {
    serviceName: "Service Appointment",
    description: "Certified service appointment",
  };

  const nearbyServiceShops = useMemo(() => {
    if (!userCoordinates) return [];

    return serviceShops
      .map((shop) => ({
        ...shop,
        distanceMiles: calculateDistanceMiles(
          userCoordinates.latitude,
          userCoordinates.longitude,
          shop.latitude,
          shop.longitude,
        ),
      }))
      .filter((shop) => shop.distanceMiles <= 100)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }, [serviceShops, userCoordinates]);

  const requestServiceLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("Location is unavailable in this browser, so nearby service booking cannot be shown.");
      return;
    }

    setLocationStatus("Checking your location for shops within 100 miles...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserCoordinates(coordinates);

        const nearestShop = serviceShops
          .map((shop) => ({
            ...shop,
            distanceMiles: calculateDistanceMiles(
              coordinates.latitude,
              coordinates.longitude,
              shop.latitude,
              shop.longitude,
            ),
          }))
          .filter((shop) => shop.distanceMiles <= 100)
          .sort((a, b) => a.distanceMiles - b.distanceMiles)[0];

        setSelectedShop((current) => current || nearestShop?.name || "");
        setLocationStatus("Showing verified shops within 100 miles.");
      },
      () => {
        setLocationStatus("Location permission is required to show service shops within 100 miles.");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [serviceShops]);

  const openBooking = useCallback(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setStep(1);
    setSelectedShop("");
    setPreferredDate(tomorrow.toISOString().split("T")[0]);
    setPreferredTime("10:00 AM");
    setTransactionToken(null);
    setError(null);
    setOpen(true);
    if (!userCoordinates) requestServiceLocation();
  }, [requestServiceLocation, userCoordinates]);

  useEffect(() => {
    const handleOpenServiceBooking = (event: Event) => {
      const detail = (event as CustomEvent<{ vin?: string }>).detail;
      if (detail?.vin && detail.vin !== vin) return;
      openBooking();
    };

    window.addEventListener("supercars:open-service-booking", handleOpenServiceBooking);
    return () => window.removeEventListener("supercars:open-service-booking", handleOpenServiceBooking);
  }, [openBooking, vin]);

  async function submitBooking() {
    try {
      setSubmitting(true);
      setError(null);
      const result = await createServiceBookingPackage({
        vin,
        serviceName: bookingRule.serviceName,
        shopName: selectedShop,
        preferredDate,
        preferredTime,
        notes: `Vehicle Passport service booking for ${makeName} (${vin})`,
      });
      setTransactionToken(result.publicTransactionToken);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit service booking request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="vehicle-service-booking-backdrop" role="presentation">
      <section className="vehicle-service-booking-modal" role="dialog" aria-modal="true" aria-labelledby="vehicle-service-booking-title">
        <header className="vehicle-service-booking-header">
          <div>
            <span>Service Booking</span>
            <h2 id="vehicle-service-booking-title">Schedule {bookingRule.serviceName}</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close service booking">
            ×
          </button>
        </header>

        {step === 1 ? (
          <div className="vehicle-service-booking-body">
            <div className="vehicle-service-booking-copy">
              <strong>Nearby certified shops</strong>
              <p>Service booking only shows verified shops with an email on file within 100 miles of you.</p>
            </div>
            {!userCoordinates ? (
              <button type="button" className="vehicle-service-booking-primary" onClick={requestServiceLocation}>
                Use My Location
              </button>
            ) : null}
            {locationStatus ? <p className="vehicle-service-booking-status">{locationStatus}</p> : null}
            <div className="vehicle-service-booking-shops">
              {userCoordinates && nearbyServiceShops.length === 0 ? (
                <div className="vehicle-service-booking-empty">No verified service shops with email are available within 100 miles.</div>
              ) : null}
              {nearbyServiceShops.map((shop) => (
                <label key={shop.id} className={selectedShop === shop.name ? "is-selected" : ""}>
                  <input
                    type="radio"
                    name="serviceShop"
                    checked={selectedShop === shop.name}
                    onChange={() => setSelectedShop(shop.name)}
                  />
                  <span>
                    <strong>{shop.name}</strong>
                    <small>
                      {[shop.city, shop.state].filter(Boolean).join(", ")} · {Math.round(shop.distanceMiles).toLocaleString()} miles away
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <div className="vehicle-service-booking-actions">
              <button type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" disabled={!selectedShop} onClick={() => setStep(2)}>Next</button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="vehicle-service-booking-body">
            <div className="vehicle-service-booking-copy">
              <strong>Preferred appointment</strong>
              <p>The shop can accept, decline, or ignore the request. Payment is only requested after acceptance.</p>
            </div>
            <label className="vehicle-service-booking-field">
              Date
              <input type="date" value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} />
            </label>
            <label className="vehicle-service-booking-field">
              Time
              <select value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)}>
                {["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"].map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </label>
            <div className="vehicle-service-booking-actions">
              <button type="button" onClick={() => setStep(1)}>Back</button>
              <button type="button" disabled={!preferredDate || !preferredTime} onClick={() => setStep(3)}>Review</button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="vehicle-service-booking-body">
            <div className="vehicle-service-booking-copy">
              <strong>Review request</strong>
              <p>This sends the shop a tokenized fulfillment request. The SUPERCAR DASH booking fee is handled only after shop acceptance.</p>
            </div>
            <dl className="vehicle-service-booking-review">
              <div><dt>Service</dt><dd>{bookingRule.serviceName}</dd></div>
              <div><dt>Shop</dt><dd>{selectedShop}</dd></div>
              <div><dt>Appointment</dt><dd>{preferredDate} at {preferredTime}</dd></div>
            </dl>
            {error ? <p className="vehicle-service-booking-error">{error}</p> : null}
            <div className="vehicle-service-booking-actions">
              <button type="button" onClick={() => setStep(2)}>Back</button>
              <button type="button" disabled={submitting} onClick={submitBooking}>
                {submitting ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="vehicle-service-booking-body">
            <div className="vehicle-service-booking-copy">
              <strong>Request sent</strong>
              <p>The shop has the booking package. You can track the request from your transactions page.</p>
            </div>
            <div className="vehicle-service-booking-actions">
              <button type="button" onClick={() => setOpen(false)}>Close</button>
              {transactionToken ? <Link href={`/transactions/${transactionToken}`}>View Transaction</Link> : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
