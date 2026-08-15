"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPartSystemsApiPath } from "@/lib/parts/parts-api";
import type { PartsStorePage, PartsStoreSummary } from "@/lib/parts/storefront";
import {
  CategoryLineIcon,
  type PartsBrandRow,
  type PartsCategoryRow,
  type PartsGarageCarRow,
} from "./PartsStoreExplorer";
import { PartsVehicleHero, type PartsVehicleHeroVehicle } from "./PartsVehicleHero";
import { PartTypeCategorySelector } from "./PartTypeCategorySelector";
import { PartsWorkspaceShell } from "./PartsWorkspaceShell";
import type { PartsEngineeringRecommendationSummary } from "@/lib/parts/engineering-recommendation-service";

type PartsTuningShopProps = {
  categories: PartsCategoryRow[];
  brands: PartsBrandRow[];
  garageCars: PartsGarageCarRow[];
  fitmentMakes: Array<{ id: string; name: string; slug: string }>;
  fitmentModels: FitmentModel[];
  initialMakeId?: string;
  initialModelId?: string;
};

type FitmentModel = {
  id: string;
  name: string;
  makeId: string;
  slug: string;
  productionStartYear: number | null;
  productionEndYear: number | null;
  partsEngineEnabled: boolean;
};

type PartSystem = { id: string; name: string; slug: string; componentCount: number };
type PartsVehicleSummary = PartsVehicleHeroVehicle;
const CATEGORY_ORDER = [
  "maintenance-service",
  "engine",
  "air-induction",
  "fuel-system",
  "cooling",
  "exhaust-emissions",
  "ecu-electronics",
  "transmission-drivetrain",
  "suspension-steering",
  "brakes",
  "wheels-tires",
  "body-exterior",
  "aerodynamics",
  "interior",
  "lighting",
  "accessories-care",
  "performance-packages",
];

const EMPTY_PAGE: PartsStorePage = {
  parts: [],
  total: 0,
  page: 1,
  pageSize: 24,
  totalPages: 1,
  hasMore: false,
  categoryCounts: {},
  brandCounts: {},
};

export function PartsTuningShop({
  categories,
  brands,
  garageCars,
  fitmentMakes,
  fitmentModels,
  initialMakeId = "",
  initialModelId = "",
}: PartsTuningShopProps) {
  const orderedCategories = useMemo(() => sortCategories(categories), [categories]);
  const engineEnabledModelIds = useMemo(
    () => new Set(fitmentModels.filter((model) => model.partsEngineEnabled).map((model) => model.id)),
    [fitmentModels],
  );
  const initialGarageCar = garageCars.find((car) => car.modelId === initialModelId)
    ?? (!initialModelId ? garageCars.find((car) => engineEnabledModelIds.has(car.modelId)) : null)
    ?? (!initialModelId ? garageCars[0] : null)
    ?? null;
  const [activeGarageCarId, setActiveGarageCarId] = useState(initialGarageCar?.id ?? "");
  const [activeMakeId, setActiveMakeId] = useState(initialMakeId || initialGarageCar?.makeId || "");
  const [activeModelId, setActiveModelId] = useState(initialModelId || initialGarageCar?.modelId || "");
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [activeBrandId, setActiveBrandId] = useState("");
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [brandCounts, setBrandCounts] = useState<Record<string, number>>({});
  const [catalogPage, setCatalogPage] = useState(EMPTY_PAGE);
  const [page, setPage] = useState(1);
  const [summaryLoading, setSummaryLoading] = useState(Boolean(initialMakeId || initialModelId || initialGarageCar));
  const [vehiclePartsSystems, setVehiclePartsSystems] = useState<PartSystem[]>([]);
  const [catalogVehicle, setCatalogVehicle] = useState<PartsVehicleSummary | null>(null);
  const [engineeringRecommendation, setEngineeringRecommendation] = useState<PartsEngineeringRecommendationSummary | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(!initialGarageCar && !initialModelId);
  const [partsLoading, setPartsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const selectedGarageCar = garageCars.find((car) => car.id === activeGarageCarId) ?? null;
  const selectedMake = fitmentMakes.find((make) => make.id === activeMakeId);
  const selectedModel = fitmentModels.find((model) => model.id === activeModelId);
  const usesVehiclePartsEngine = Boolean(selectedModel?.partsEngineEnabled);

  useEffect(() => {
    if (!selectedMake || !selectedModel) return;

    const controller = new AbortController();
    const ownedVehicleId = selectedGarageCar?.id.startsWith("claimed:") ? selectedGarageCar.id.slice("claimed:".length) : null;
    fetch(getPartSystemsApiPath({ makeSlug: selectedMake.slug, modelSlug: selectedModel.slug }, { vehicleId: ownedVehicleId }), {
      signal: controller.signal,
      cache: "no-cache",
    })
      .then(readJson<{ vehicle: PartsVehicleSummary; systems: PartSystem[]; recommendation: PartsEngineeringRecommendationSummary | null }>)
      .then((result) => {
        if (controller.signal.aborted) return;
        setCatalogVehicle(result.vehicle);
        setVehiclePartsSystems(result.systems);
        setEngineeringRecommendation(result.recommendation);
      })
      .catch((error) => handleComponentError(error, controller, setLoadError))
      .finally(() => { if (!controller.signal.aborted) setSummaryLoading(false); });

    return () => controller.abort();
  }, [selectedGarageCar, selectedMake, selectedModel]);

  useEffect(() => {
    if (!activeMakeId && !activeModelId) return;
    if (usesVehiclePartsEngine) return;

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (activeMakeId) params.set("make", activeMakeId);
    if (activeModelId) params.set("model", activeModelId);

    fetch(`/api/parts/catalog/summary?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load compatible systems");
        return response.json() as Promise<PartsStoreSummary>;
      })
      .then((result) => setCategoryCounts(result.categoryCounts))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError("Compatible systems could not be loaded. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });

    return () => controller.abort();
  }, [activeMakeId, activeModelId, usesVehiclePartsEngine]);

  useEffect(() => {
    if (!activeCategoryId || (!activeMakeId && !activeModelId)) return;
    if (usesVehiclePartsEngine) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ category: activeCategoryId, page: String(page) });
    if (activeBrandId) {
      params.set("brand", activeBrandId);
      params.set("facets", "0");
    }
    if (activeMakeId) params.set("make", activeMakeId);
    if (activeModelId) params.set("model", activeModelId);

    fetch(`/api/parts/catalog?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load parts");
        return response.json() as Promise<PartsStorePage>;
      })
      .then((result) => {
        setCatalogPage(result);
        if (Object.keys(result.brandCounts).length > 0) setBrandCounts(result.brandCounts);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError("Parts could not be loaded. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPartsLoading(false);
      });

    return () => controller.abort();
  }, [activeBrandId, activeCategoryId, activeMakeId, activeModelId, usesVehiclePartsEngine, page]);

  const modelOptions = fitmentModels.filter((model) => !activeMakeId || model.makeId === activeMakeId);
  const selectedVehicleLabel = selectedGarageCar?.label
    ?? ([selectedMake?.name, selectedModel?.name].filter(Boolean).join(" ") || "Select a vehicle");
  const hasVehicleSelection = Boolean(activeMakeId || activeModelId);
  const compatibleCategories = orderedCategories
    .map((category) => ({ ...category, partCount: categoryCounts[category.id] ?? 0 }))
    .filter((category) => category.partCount > 0);
  const activeCategory = orderedCategories.find((category) => category.id === activeCategoryId) ?? null;
  const visibleBrands = brands
    .map((brand) => ({ ...brand, partCount: brandCounts[brand.id] ?? 0 }))
    .filter((brand) => brand.partCount > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedVehicle = selectedGarageCar
    ? mergeVehicleSummary(garageCarToVehicleSummary(selectedGarageCar), catalogVehicle)
    : catalogVehicle;

  function returnToCategories() {
    setActiveCategoryId("");
    setActiveBrandId("");
    setBrandCounts({});
    setCatalogPage(EMPTY_PAGE);
    setPage(1);
    setPartsLoading(false);
  }

  function prepareVehicleChange() {
    returnToCategories();
    setCategoryCounts({});
    setVehiclePartsSystems([]);
    setCatalogVehicle(null);
    setEngineeringRecommendation(null);
    setSummaryLoading(true);
    setLoadError("");
  }

  function selectBrand(brandId: string) {
    setActiveBrandId(brandId);
    setPage(1);
    setPartsLoading(true);
    setLoadError("");
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    setPartsLoading(true);
    setLoadError("");
  }

  return (
    <PartsWorkspaceShell
      className="parts-store-shell parts-tuning-shell"
      contentClassName="parts-tuning-stage"
      contentLabel="Vehicle tuning catalog"
    >
        <nav className="parts-page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link><span aria-hidden="true">/</span><strong>Parts</strong><span aria-hidden="true">/</span><span>{selectedVehicle ? "Selected vehicle" : "Select vehicle"}</span>
        </nav>

        <PartsVehicleHero
          vehicle={selectedVehicle}
          loading={summaryLoading}
          recommendationSummary={engineeringRecommendation ?? undefined}
          changeVehicleControl={<button type="button" onClick={() => setSelectorOpen((open) => !open)}>Change vehicle</button>}
        />

        {selectorOpen ? (
          <div className="parts-vehicle-selector-drawer">
            <div>
              <span>Vehicle selection</span>
              <strong>Choose from your garage or browse by make and model</strong>
            </div>
            <VehicleSelector
              garageCars={garageCars}
              activeGarageCarId={activeGarageCarId}
              activeMakeId={activeMakeId}
              activeModelId={activeModelId}
              makes={fitmentMakes}
              models={modelOptions}
              onGarageCarChange={(garageCarId) => {
                prepareVehicleChange();
                setActiveGarageCarId(garageCarId);
                const car = garageCars.find((item) => item.id === garageCarId);
                setActiveMakeId(car?.makeId ?? "");
                setActiveModelId(car?.modelId ?? "");
                if (car) setSelectorOpen(false);
                else setSummaryLoading(false);
              }}
              onMakeChange={(makeId) => {
                prepareVehicleChange();
                setActiveGarageCarId("");
                setActiveMakeId(makeId);
                setActiveModelId("");
                if (!makeId) setSummaryLoading(false);
              }}
              onModelChange={(modelId) => {
                prepareVehicleChange();
                setActiveGarageCarId("");
                setActiveModelId(modelId);
                if (modelId) setSelectorOpen(false);
              }}
            />
          </div>
        ) : null}

        {loadError ? <div className="parts-load-error" role="alert">{loadError}</div> : null}

        {usesVehiclePartsEngine && selectedModel && selectedMake ? (
          <PartTypeCategorySelector
            key={`${selectedModel.slug}:${selectedGarageCar?.year ?? "model"}`}
            makeSlug={selectedMake.slug}
            modelSlug={selectedModel.slug}
            year={selectedGarageCar?.year ?? selectedModel.productionEndYear ?? selectedModel.productionStartYear}
            vehicleId={selectedGarageCar?.id.startsWith("claimed:") ? selectedGarageCar.id.slice("claimed:".length) : null}
            systems={vehiclePartsSystems}
            loading={summaryLoading}
          />
        ) : !activeCategory ? (
          <section className="parts-tuning-category-hub" aria-busy={summaryLoading}>
            <div className="parts-tuning-section-heading">
              <span>Parts Systems</span>
              <h2>{hasVehicleSelection ? "Choose a system" : "Browse parts by system"}</h2>
            </div>
            {!hasVehicleSelection ? (
              <div className="parts-vehicle-prompt">Select a vehicle above to see compatible parts and live products.</div>
            ) : null}
            {summaryLoading ? <div className="parts-tuning-loading">Scanning compatible systems...</div> : null}
            <div className="parts-tuning-category-grid">
              {(hasVehicleSelection ? compatibleCategories : orderedCategories).map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="parts-tuning-category-tile"
                  data-category={category.slug}
                  disabled={!hasVehicleSelection || summaryLoading || category.partCount === 0}
                  onClick={() => {
                    setActiveCategoryId(category.id);
                    setActiveBrandId("");
                    setBrandCounts({});
                    setCatalogPage(EMPTY_PAGE);
                    setPage(1);
                    setPartsLoading(true);
                    setLoadError("");
                  }}
                >
                  <CategoryLineIcon slug={category.slug} />
                  <strong>{category.name}</strong>
                  <span>{hasVehicleSelection ? `${category.partCount.toLocaleString()} compatible` : "Explore system"}</span>
                </button>
              ))}
            </div>
            {hasVehicleSelection && !summaryLoading && compatibleCategories.length === 0 ? (
              <div className="parts-empty-state">
                <h3>No verified systems captured for this vehicle</h3>
                <p>The catalog will populate here as compatible, source-backed parts are added.</p>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="parts-tuning-category-detail">
            <header className="parts-tuning-category-header">
              <button type="button" onClick={returnToCategories}>Back to Categories</button>
              <div>
                <CategoryLineIcon slug={activeCategory.slug} />
                <span>Selected System</span>
                <h2>{activeCategory.name}</h2>
              </div>
            </header>

            <div className="parts-tuning-brand-filter">
              <div className="parts-tuning-brand-heading">
                <span>Choose Brand</span>
                <strong>{selectedVehicleLabel}</strong>
              </div>
              <div className="parts-brand-strip" aria-label="Brands in selected category">
                <button
                  type="button"
                  className={`parts-brand-chip${activeBrandId === "" ? " is-active" : ""}`}
                  onClick={() => selectBrand("")}
                >
                  All Brands
                </button>
                {visibleBrands.map((brand) => (
                  <BrandButton
                    key={brand.id}
                    brand={brand}
                    active={activeBrandId === brand.id}
                    onClick={() => selectBrand(brand.id)}
                  />
                ))}
              </div>
            </div>

            <div className={partsLoading ? "parts-results-loading" : undefined} aria-busy={partsLoading}>
              {!partsLoading && catalogPage.parts.length === 0 ? (
                <div className="parts-empty-state">
                  <h3>No compatible parts found</h3>
                  <p>Try another brand or return to the category grid.</p>
                </div>
              ) : (
                <div className="parts-card-grid parts-tuning-product-grid">
                  {catalogPage.parts.map((part) => (
                    <article key={part.id} className="parts-card parts-tuning-part-card">
                      <a className="parts-card-image" href={part.detailPath} aria-label={`View ${part.name}`}>
                        {part.imageUrl ? <img src={part.imageUrl} alt="" loading="lazy" /> : <span>{part.categoryName}</span>}
                      </a>
                      <div className="parts-card-body">
                        <div className="parts-card-brand">
                          {isCleanBrandLogo(part.brandLogoUrl, part.brandLogoBackground, part.brandLogoNeedsReview) ? (
                            <img src={part.brandLogoUrl ?? ""} alt="" loading="lazy" />
                          ) : null}
                          <span>{part.brandName}</span>
                        </div>
                        <h3><a href={part.detailPath}>{part.name}</a></h3>
                        {part.fitmentSummary ? <p className="parts-card-fitment">{part.fitmentSummary}</p> : null}
                        <div className="parts-card-meta">
                          <span>{part.priceLabel}</span>
                          {part.hpGainLabel ? <span>{part.hpGainLabel}</span> : null}
                          {part.torqueGainLabel ? <span>{part.torqueGainLabel}</span> : null}
                        </div>
                        <div className="parts-card-actions"><a href={part.detailPath}>View Part</a></div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {page > 1 || catalogPage.hasMore ? (
              <nav className="parts-pagination" aria-label="Parts catalog pages">
                <button type="button" disabled={page <= 1 || partsLoading} onClick={() => changePage(Math.max(1, page - 1))}>Previous</button>
                <span>Page {page.toLocaleString()}</span>
                <button type="button" disabled={!catalogPage.hasMore || partsLoading} onClick={() => changePage(page + 1)}>Next</button>
              </nav>
            ) : null}
          </section>
        )}
    </PartsWorkspaceShell>
  );
}

function VehicleSelector({
  garageCars,
  activeGarageCarId,
  activeMakeId,
  activeModelId,
  makes,
  models,
  onGarageCarChange,
  onMakeChange,
  onModelChange,
}: {
  garageCars: PartsGarageCarRow[];
  activeGarageCarId: string;
  activeMakeId: string;
  activeModelId: string;
  makes: Array<{ id: string; name: string }>;
  models: FitmentModel[];
  onGarageCarChange: (value: string) => void;
  onMakeChange: (value: string) => void;
  onModelChange: (value: string) => void;
}) {
  return (
    <div className="parts-tuning-selector" aria-label="Vehicle selector">
      <label>
        <span>My Garage</span>
        <select value={activeGarageCarId} onChange={(event) => onGarageCarChange(event.target.value)}>
          <option value="">{garageCars.length > 0 ? "Choose garage car" : "No garage cars"}</option>
          {garageCars.map((car) => <option key={car.id} value={car.id}>{car.label}</option>)}
        </select>
      </label>
      <label>
        <span>Make</span>
        <select value={activeMakeId} onChange={(event) => onMakeChange(event.target.value)}>
          <option value="">Choose make</option>
          {makes.map((make) => <option key={make.id} value={make.id}>{make.name}</option>)}
        </select>
      </label>
      <label>
        <span>Model</span>
        <select value={activeModelId} onChange={(event) => onModelChange(event.target.value)} disabled={!activeMakeId}>
          <option value="">All compatible models</option>
          {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
        </select>
      </label>
    </div>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  let payload: { error?: unknown } | T | null = null;
  if (body) {
    try {
      payload = JSON.parse(body) as { error?: unknown } | T;
    } catch {
      if (response.ok) throw new Error("The server returned an invalid response.");
    }
  }
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    throw new Error(typeof error === "string" ? error : "The request could not be completed.");
  }
  if (!payload) throw new Error("The server returned an empty response.");
  return payload as T;
}

function handleComponentError(error: unknown, controller: AbortController, setError: (value: string) => void) {
  if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
  setError(error instanceof Error ? error.message : "Compatible parts are unavailable.");
}

function BrandButton({ brand, active, onClick }: { brand: PartsBrandRow; active: boolean; onClick: () => void }) {
  const logo = isCleanBrandLogo(brand.logoUrl, brand.logoBackground, brand.logoNeedsReview) ? brand.logoUrl : null;
  return (
    <button type="button" className={`parts-brand-chip${logo ? " has-logo" : ""}${active ? " is-active" : ""}`} onClick={onClick}>
      {logo ? <img src={logo} alt="" loading="lazy" /> : null}
      <span className="parts-brand-wordmark">{brand.name}</span>
    </button>
  );
}

function isCleanBrandLogo(url: string | null, background: string, needsReview: boolean) {
  return Boolean(url && !needsReview && !url.startsWith("/parts/placeholders/brand/") && background === "TRANSPARENT");
}

function sortCategories(categories: PartsCategoryRow[]) {
  return [...categories].sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a.slug);
    const bIndex = CATEGORY_ORDER.indexOf(b.slug);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
    }
    return a.name.localeCompare(b.name);
  });
}

function garageCarToVehicleSummary(car: PartsGarageCarRow): PartsVehicleSummary {
  return {
    year: car.year,
    makeName: car.makeName ?? "",
    makeSlug: car.makeSlug ?? "",
    makeLogoUrl: car.makeLogoUrl ?? null,
    modelName: car.modelName ?? car.label,
    modelSlug: car.modelSlug,
    variant: car.variant ?? null,
    imageUrl: car.imageUrl,
    engine: car.engine ?? null,
    horsepower: car.horsepower ?? null,
    torque: car.torque ?? null,
    weight: car.weight ?? null,
    drivetrain: car.drivetrain ?? null,
    transmission: car.transmission ?? null,
    aspiration: car.aspiration ?? null,
    buildStage: car.buildStage ?? "Garage vehicle",
    detailPath: car.detailPath ?? "",
    exactOwnedVehicle: car.exactOwnedVehicle ?? false,
  };
}

function mergeVehicleSummary(build: PartsVehicleSummary, model: PartsVehicleSummary | null): PartsVehicleSummary {
  if (!model) return build;

  return {
    ...model,
    ...build,
    year: build.year ?? model.year,
    makeName: build.makeName || model.makeName,
    makeSlug: build.makeSlug || model.makeSlug,
    makeLogoUrl: build.makeLogoUrl || model.makeLogoUrl,
    modelName: build.modelName || model.modelName,
    modelSlug: build.modelSlug || model.modelSlug,
    imageUrl: build.imageUrl || model.imageUrl,
    engine: build.engine || model.engine,
    horsepower: build.horsepower || model.horsepower,
    torque: build.torque || model.torque,
    weight: build.weight || model.weight,
    drivetrain: build.drivetrain || model.drivetrain,
    transmission: build.transmission || model.transmission,
    aspiration: build.aspiration || model.aspiration,
    detailPath: build.detailPath || model.detailPath,
  };
}
