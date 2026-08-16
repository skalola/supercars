/* eslint-disable @next/next/no-img-element */

import type { CSSProperties, ReactNode } from "react";
import { PerformanceRecommendationCarousel, type PartsRecommendationSummary } from "@/components/parts/PerformanceRecommendationCarousel";

export type PartsVehicleHeroVehicle = {
  year: number | null;
  makeName: string;
  makeSlug: string;
  makeLogoUrl: string | null;
  modelName: string;
  modelSlug: string;
  variant: string | null;
  imageUrl: string | null;
  engine: string | null;
  horsepower: string | number | null;
  torque: string | number | null;
  weight: string | number | null;
  drivetrain: string | null;
  transmission: string | null;
  aspiration: string | null;
  buildStage: string;
  detailPath: string;
  exactOwnedVehicle: boolean;
};

type PartsVehicleHeroProps = {
  vehicle: PartsVehicleHeroVehicle | null;
  loading?: boolean;
  changeVehicleControl?: ReactNode;
  performanceAccent?: {
    title: string;
    horsepowerGain: string;
    torqueGain: string;
    evidence: string;
    documented: boolean;
  };
  recommendationSummary?: PartsRecommendationSummary;
};

export function PartsVehicleHero({ vehicle, loading = false, changeVehicleControl, performanceAccent, recommendationSummary }: PartsVehicleHeroProps) {
  const horsepower = parseMetric(vehicle?.horsepower);
  const torque = parseMetric(vehicle?.torque);
  const weight = parseMetric(vehicle?.weight);
  const weightPerHorsepower = horsepower && weight ? weight / horsepower : null;
  const metrics = [
    horsepower ? { label: "Horsepower", value: formatMetric(horsepower), detail: "HP" } : null,
    torque ? { label: "Torque", value: formatMetric(torque), detail: "LB-FT" } : null,
    weight ? { label: "Weight", value: formatMetric(weight), detail: "LB" } : null,
    weightPerHorsepower ? { label: "Power / Weight", value: weightPerHorsepower.toFixed(1), detail: "LB/HP" } : null,
  ].filter((metric): metric is { label: string; value: string; detail: string } => Boolean(metric));
  const metadata = [
    vehicle?.drivetrain,
    vehicle?.aspiration,
    vehicle?.engine,
    vehicle?.transmission,
  ].filter((item): item is string => Boolean(item));
  const vehicleTitle = vehicle
    ? [vehicle.year, vehicle.makeName, vehicle.modelName, vehicle.variant].filter(Boolean).join(" ")
    : "Build around your car";
  const vehicleMakeLine = vehicle
    ? [vehicle.year, vehicle.makeName].filter(Boolean).join(" ")
    : loading ? "Loading vehicle" : "Select a vehicle";
  const vehicleModelLine = vehicle
    ? [vehicle.modelName, vehicle.variant].filter(Boolean).join(" ")
    : "Build around your car";
  const heroStyle = vehicle?.imageUrl
    ? { "--parts-vehicle-hero-image": `url("${vehicle.imageUrl}")` } as CSSProperties
    : undefined;

  return (
    <header
      className={`parts-vehicle-hero parts-garage-layout${vehicle?.imageUrl ? " has-image" : ""}${performanceAccent ? " has-performance-accent" : ""}${recommendationSummary ? " has-recommendation-summary" : ""}`}
      style={heroStyle}
      aria-busy={loading}
      aria-label={vehicleTitle}
    >
      <div className="parts-vehicle-hero-shade" aria-hidden="true" />
      <div className="parts-vehicle-hero-identity">
        <div className="parts-vehicle-make-badge">
          {vehicle?.makeLogoUrl ? <img src={vehicle.makeLogoUrl} alt="" /> : <span>{vehicle?.makeName?.slice(0, 2).toUpperCase() || "SD"}</span>}
        </div>
        <div className="parts-vehicle-identity-copy">
          <span className="parts-selected-vehicle-label">{vehicle?.buildStage ?? (loading ? "Loading vehicle" : "Vehicle required")}</span>
          <h1>
            <span className="parts-vehicle-title-make">{vehicleMakeLine}</span>
            <span className="parts-vehicle-title-model">{vehicleModelLine}</span>
          </h1>
          {metadata.length > 0 ? (
            <p className="parts-vehicle-summary-line">{metadata.join(" · ")}</p>
          ) : <p className="parts-vehicle-summary-line">Choose a garage car or browse by make and model.</p>}
        </div>
      </div>

      {metrics.length > 0 ? (
        <div className="parts-vehicle-metrics" aria-label="Vehicle performance">
          {metrics.map((metric) => (
            <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>
          ))}
        </div>
      ) : null}

      {performanceAccent ? (
        <div className={`parts-vehicle-gain-accent${performanceAccent.documented ? " is-documented" : " is-pending"}`}>
          <div>
            <span>Selected Upgrade</span>
            <strong>{performanceAccent.title}</strong>
            <small>{performanceAccent.evidence}</small>
          </div>
          <article>
            <span>Power Gain</span>
            <strong>{performanceAccent.horsepowerGain}</strong>
          </article>
          <article>
            <span>Torque Gain</span>
            <strong>{performanceAccent.torqueGain}</strong>
          </article>
        </div>
      ) : null}

      {recommendationSummary ? (
        <PerformanceRecommendationCarousel key={`${vehicleTitle}-${recommendationSummary.title}`} recommendation={recommendationSummary} />
      ) : null}

      {changeVehicleControl || vehicle?.detailPath ? (
        <div className="parts-vehicle-actions">
          {changeVehicleControl}
          {vehicle?.detailPath ? <a href={vehicle.detailPath}>{vehicle.exactOwnedVehicle ? "View my build" : "View vehicle"}</a> : null}
        </div>
      ) : null}
    </header>
  );
}

function parseMetric(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const match = value?.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMetric(value: number) {
  return Math.round(value).toLocaleString();
}
