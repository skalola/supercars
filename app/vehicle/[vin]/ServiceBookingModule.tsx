"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createServiceBookingPackage } from "@/app/actions/passport";

type ServiceRule = {
  serviceName: string;
  description?: string | null;
};

type ServiceShop = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  distanceMiles: number;
};

type ServiceBookingModuleProps = {
  vin: string;
  makeName: string;
  defaultRule: ServiceRule | null;
};

export default function ServiceBookingModule({
  vin,
  makeName,
  defaultRule,
}: ServiceBookingModuleProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [serviceShops, setServiceShops] = useState<ServiceShop[]>([]);
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

  const loadServiceShops = useCallback(async (coordinates: { latitude: number; longitude: number }) => {
    if (serviceShops.length > 0) return serviceShops;

    const search = new URLSearchParams({
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
    });
    const response = await fetch(`/api/service-shops?${search.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error("Unable to load verified service shops right now.");
    }

    const payload = (await response.json()) as { shops?: ServiceShop[] };
    const shops = payload.shops || [];
    setServiceShops(shops);
    return shops;
  }, [serviceShops]);

  const requestServiceLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationStatus("Location is unavailable in this browser, so nearby service booking cannot be shown.");
      return;
    }

    setLocationStatus("Checking your location for shops within 100 miles...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserCoordinates(coordinates);

        try {
          const shops = await loadServiceShops(coordinates);
          setSelectedShop((current) => current || shops[0]?.name || "");
          setLocationStatus(
            shops.length > 0
              ? "Showing verified shops within 100 miles."
              : "No verified service shops with email are available within 100 miles.",
          );
        } catch (err) {
          setLocationStatus(err instanceof Error ? err.message : "Unable to load verified service shops right now.");
        }
      },
      () => {
        setLocationStatus("Location permission is required to show service shops within 100 miles.");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, [loadServiceShops]);

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
              {userCoordinates && serviceShops.length === 0 ? (
                <div className="vehicle-service-booking-empty">No verified service shops with email are available within 100 miles.</div>
              ) : null}
              {serviceShops.map((shop) => (
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
