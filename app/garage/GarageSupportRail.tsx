"use client";

import Image from "next/image";
import Link from "next/link";

export type GarageServiceWatchItem = {
  id: string;
  href: string;
  logoUrl: string | null;
  vehicleLabel: string;
  serviceName: string;
  dueText: string;
  status: "DUE" | "DUE_SOON" | "UPCOMING";
};

export type GarageRecentActivityItem = {
  id: string;
  href: string;
  tone: "add" | "service" | "market" | "meet" | "club";
  title: string;
  subtitle: string;
  timestamp: string;
};

export default function GarageSupportRail({
  serviceWatch,
  recentActivity,
  isOwner,
  garageHref,
  trackerHref,
}: {
  serviceWatch: GarageServiceWatchItem[];
  recentActivity: GarageRecentActivityItem[];
  isOwner: boolean;
  garageHref: string;
  trackerHref: string;
}) {
  return (
    <div className="garage-support-rail">
      <section className="garage-rail-card" aria-label="Service watch">
        <div className="garage-rail-heading">
          <h2>Service Watch</h2>
          <Link href={isOwner ? trackerHref : garageHref}>View all</Link>
        </div>
        {serviceWatch.length > 0 ? (
          <div className="garage-rail-list">
            {serviceWatch.slice(0, 3).map((item) => (
              <Link key={item.id} href={item.href} className="garage-rail-list-item">
                <span className="garage-rail-logo">
                  {item.logoUrl ? <Image src={item.logoUrl} alt="" width={30} height={30} unoptimized /> : item.vehicleLabel.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{item.vehicleLabel}</strong>
                  <em>{item.serviceName}</em>
                </span>
                <b className={`is-${item.status.toLowerCase()}`}>{item.dueText}</b>
              </Link>
            ))}
          </div>
        ) : (
          <div className="garage-rail-empty">
            <p>Claimed cars with mileage and maintenance rules will appear here.</p>
            {isOwner ? <Link href="/claim">Claim Car</Link> : null}
          </div>
        )}
      </section>

      <section className="garage-rail-card" aria-label="Recent garage activity">
        <div className="garage-rail-heading">
          <h2>Recent Garage Activity</h2>
          <Link href={garageHref}>View all</Link>
        </div>
        {recentActivity.length > 0 ? (
          <div className="garage-rail-activity-list">
            {recentActivity.slice(0, 4).map((item) => (
              <Link key={item.id} href={item.href} className="garage-rail-activity-item">
                <span className={`garage-rail-activity-icon is-${item.tone}`} aria-hidden="true" />
                <span>
                  <strong>{item.title}</strong>
                  <em>{item.subtitle}</em>
                </span>
                <b>{item.timestamp}</b>
              </Link>
            ))}
          </div>
        ) : (
          <div className="garage-rail-empty">
            <p>Garage activity will appear after cars, clubs, or meets are added.</p>
          </div>
        )}
      </section>
    </div>
  );
}
