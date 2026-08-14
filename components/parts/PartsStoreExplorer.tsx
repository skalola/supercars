"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PartsStorePage } from "@/lib/parts/storefront";

export type PartsCategoryRow = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string;
  partCount: number;
};

export type PartsBrandRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  logoBackground: string;
  logoNeedsReview: boolean;
  partCount: number;
};

export type PartsStorePartRow = {
  id: string;
  name: string;
  partNumber: string | null;
  detailPath: string;
  description: string | null;
  imageUrl: string | null;
  priceLabel: string;
  hpGainLabel: string | null;
  torqueGainLabel: string | null;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  brandLogoUrl: string | null;
  brandLogoBackground: string;
  brandLogoNeedsReview: boolean;
  fitmentSummary: string | null;
  fitmentCount: number;
};

export type PartsGarageCarRow = {
  id: string;
  label: string;
  detail: string;
  makeId: string;
  modelId: string;
  imageUrl: string | null;
};

type PartsStoreExplorerProps = {
  categories: PartsCategoryRow[];
  brands: PartsBrandRow[];
  initialPage: PartsStorePage;
  initialCategoryId: string;
  catalogNodeCount: number;
  garageCars: PartsGarageCarRow[];
  fitmentMakes: Array<{ id: string; name: string }>;
  fitmentModels: Array<{ id: string; name: string; makeId: string }>;
  initialMakeId?: string;
  initialModelId?: string;
};

const SHOP_CATEGORY_ORDER = [
  "intake",
  "exhaust",
  "ecu-tuning",
  "forced-induction",
  "brakes",
  "suspension",
  "wheels-tires",
  "aero-body",
  "drivetrain",
  "interior-safety",
  "fueling",
  "cooling",
];

export function PartsStoreExplorer({
  categories,
  brands,
  initialPage,
  initialCategoryId,
  catalogNodeCount,
  garageCars,
  fitmentMakes,
  fitmentModels,
  initialMakeId = "",
  initialModelId = "",
}: PartsStoreExplorerProps) {
  const displayCategories = useMemo(() => sortShopCategories(categories), [categories]);
  const [activeCategoryId, setActiveCategoryId] = useState(initialCategoryId);
  const [activeBrandId, setActiveBrandId] = useState("");
  const [activeMakeId, setActiveMakeId] = useState(initialMakeId);
  const [activeModelId, setActiveModelId] = useState(initialModelId);
  const [activeGarageCarId, setActiveGarageCarId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(initialPage);
  const [page, setPage] = useState(initialPage.page);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const initialRequest = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (initialRequest.current) {
      initialRequest.current = false;
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    if (activeCategoryId) params.set("category", activeCategoryId);
    if (activeBrandId) params.set("brand", activeBrandId);
    if (activeMakeId) params.set("make", activeMakeId);
    if (activeModelId) params.set("model", activeModelId);
    if (debouncedSearch) params.set("q", debouncedSearch);
    params.set("page", String(page));

    setIsLoading(true);
    setLoadError("");
    fetch(`/api/parts/catalog?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load parts");
        return response.json() as Promise<PartsStorePage>;
      })
      .then((result) => {
        setCatalogPage(result);
        if (result.page !== page) setPage(result.page);
        if (activeCategoryId && !result.categoryCounts[activeCategoryId]) {
          const fallbackCategory = displayCategories.find((category) => result.categoryCounts[category.id] > 0);
          if (fallbackCategory) {
            setActiveCategoryId(fallbackCategory.id);
            setActiveBrandId("");
            setPage(1);
          }
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError("Parts could not be loaded. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [activeBrandId, activeCategoryId, activeMakeId, activeModelId, debouncedSearch, displayCategories, page]);

  const categoryRowsForSelectedCar = useMemo(() => {
    return displayCategories
      .map((category) => ({
        ...category,
        partCount: catalogPage.categoryCounts[category.id] ?? 0,
      }))
      .filter((category) => category.partCount > 0);
  }, [catalogPage.categoryCounts, displayCategories]);
  const categoryHasSelectedCarResults = Boolean(activeMakeId || activeModelId);
  const effectiveActiveCategoryId = categoryRowsForSelectedCar.some((category) => category.id === activeCategoryId)
    ? activeCategoryId
    : categoryRowsForSelectedCar[0]?.id ?? (categoryHasSelectedCarResults ? "__empty__" : "");
  const activeCategory = categoryRowsForSelectedCar.find((category) => category.id === effectiveActiveCategoryId) ?? categoryRowsForSelectedCar[0] ?? null;

  const visibleBrands = useMemo(() => {
    return brands
      .map((brand) => ({ ...brand, partCount: catalogPage.brandCounts[brand.id] ?? 0 }))
      .filter((brand) => brand.partCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [brands, catalogPage.brandCounts]);

  const makeOptions = useMemo(() => {
    return fitmentMakes.map((make) => ({ ...make, count: 0 }));
  }, [fitmentMakes]);

  const modelOptions = useMemo(() => {
    return fitmentModels
      .filter((model) => !activeMakeId || model.makeId === activeMakeId)
      .map((model) => ({ ...model, count: 0 }));
  }, [activeMakeId, fitmentModels]);

  const activeCategoryParts = catalogPage.parts;
  const featuredParts = activeCategoryParts.slice(0, 4);
  const remainingParts = activeCategoryParts.slice(4);
  const catalogPartCount = Object.values(catalogPage.categoryCounts).reduce((sum, count) => sum + count, 0);
  const buildProgressPercent = Math.min(98, Math.max(12, Math.round((catalogPartCount / Math.max(catalogNodeCount, 1)) * 100)));
  const buildProgressRows = displayCategories.filter((category) => category.partCount > 0).slice(0, 7);
  const activeFilterCount = [activeBrandId, activeMakeId, activeModelId].filter(Boolean).length;
  const selectedGarageCar = garageCars.find((car) => car.id === activeGarageCarId) ?? null;

  const resetFilters = () => {
    setActiveCategoryId(initialCategoryId);
    setActiveBrandId("");
    setActiveMakeId("");
    setActiveModelId("");
    setActiveGarageCarId("");
    setSearchQuery("");
    setPage(1);
  };

  return (
    <main className="parts-store-shell">
      <section className="parts-store-hero">
        <div>
          <h1>Parts Shop</h1>
          <p className="parts-store-subtitle">
            <span className="parts-subtitle-dash" aria-hidden="true" />
            <span>Performance. Precision. Passion.</span>
          </p>
          <p className="parts-store-disclosure">
            Partner purchase links stay inactive until approved programs are active.
          </p>
        </div>
      </section>

      <section className="parts-store-layout" aria-label="Parts catalog browser">
        <aside className="parts-category-panel">
          <div className="parts-panel-heading">
            <span>Category</span>
            <button type="button" onClick={resetFilters}>Reset</button>
          </div>
          <div className="parts-category-list">
            {categoryRowsForSelectedCar.map((category) => {
              const isActive = category.id === activeCategory?.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`parts-category-button${isActive ? " is-active" : ""}`}
                  data-category={category.slug}
                  title={category.name}
                  onClick={() => {
                    setActiveCategoryId(category.id);
                    setActiveBrandId("");
                    setPage(1);
                  }}
                >
                  <CategoryLineIcon slug={category.slug} />
                  <span>{category.name}</span>
                  <small>{category.partCount.toLocaleString()}</small>
                </button>
              );
            })}
            {categoryRowsForSelectedCar.length === 0 ? (
              <div className="parts-category-empty-state">No part systems found for this car yet.</div>
            ) : null}
          </div>
          <button type="button" className="parts-view-all-button" onClick={resetFilters}>
            <span aria-hidden="true">▦</span>
            View All Parts
          </button>
        </aside>

        <section className="parts-results-panel">
          <div className="parts-results-header">
            <div className="parts-active-category-summary">
              <p className="garage-page-eyebrow">Selected System</p>
              <h2>{activeCategory?.name ?? "Performance Systems"}</h2>
            </div>
            <label className="parts-search-field">
              <span>Search</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Part, brand, model, fitment"
              />
            </label>
          </div>

          <details className="parts-mobile-filter-drawer">
            <summary>
              <span>Filters</span>
              <strong>{activeFilterCount > 0 ? `${activeFilterCount} active` : `${catalogPage.total.toLocaleString()} results`}</strong>
            </summary>
            <div className="parts-mobile-filter-body">
              <div className="parts-mobile-filter-group">
                <div className="parts-mobile-filter-heading">
                  <span>Brand</span>
                  <button type="button" onClick={() => { setActiveBrandId(""); setPage(1); }}>All Brands</button>
                </div>
                <div className="parts-mobile-brand-list" aria-label="Mobile brand filters">
                  <button
                    type="button"
                    className={`parts-mobile-brand-chip${activeBrandId === "" ? " is-active" : ""}`}
                    onClick={() => { setActiveBrandId(""); setPage(1); }}
                  >
                    All
                  </button>
                  {visibleBrands.map((brand) => (
                    <button
                      key={brand.id}
                      type="button"
                      className={`parts-mobile-brand-chip${activeBrandId === brand.id ? " is-active" : ""}`}
                      onClick={() => { setActiveBrandId(brand.id); setPage(1); }}
                    >
                      {brand.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <div className="parts-brand-section parts-brand-section-primary">
            <div className="parts-section-heading">
              <span>Shop By Brand</span>
              <button type="button" onClick={() => { setActiveBrandId(""); setPage(1); }}>View All Brands</button>
            </div>
            <div className="parts-brand-strip" aria-label="Brands in selected category">
              <button
                type="button"
                className={`parts-brand-chip${activeBrandId === "" ? " is-active" : ""}`}
                onClick={() => { setActiveBrandId(""); setPage(1); }}
              >
                All Brands
              </button>
              {visibleBrands.map((brand) => (
                <BrandFilterButton
                  key={brand.id}
                  brand={brand}
                  isActive={activeBrandId === brand.id}
                  onSelect={() => { setActiveBrandId(brand.id); setPage(1); }}
                />
              ))}
              {visibleBrands.length === 0 ? (
                <span className="parts-empty-chip">No brands captured in this category yet</span>
              ) : null}
            </div>
          </div>

          <div className="parts-product-toolbar">
            <div className="parts-product-tabs" aria-label="Product views">
              <button type="button" className="is-active">Featured</button>
              <button type="button">Best Sellers</button>
              <button type="button">New Arrivals</button>
            </div>
            <div className="parts-sort-control">
              <span>Sort By:</span>
              <strong>Recommended</strong>
            </div>
          </div>

          {loadError ? <div className="parts-load-error" role="alert">{loadError}</div> : null}
          <div className={isLoading ? "parts-results-loading" : undefined} aria-busy={isLoading}>
          {activeCategoryParts.length === 0 ? (
            <div className="parts-empty-state">
              <h3>No parts captured yet</h3>
              <p>
                This category is ready. Add real parts from the admin Parts tab with source URLs, fitment, and verified estimates before anything appears here.
              </p>
            </div>
          ) : (
            <>
              <div className="parts-card-grid parts-card-grid-featured">
                {featuredParts.map((part, index) => (
                  <article key={part.id} className="parts-card">
                    <div className="parts-card-image">
                      {part.imageUrl ? (
                        <img src={part.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span>{part.categoryName}</span>
                      )}
                      <span className={`parts-card-badge badge-${index % 3}`}>{getProductBadge(index)}</span>
                    </div>
                    <div className="parts-card-body">
                      <div className="parts-card-brand">
                        {isCleanBrandLogo(part.brandLogoUrl, part.brandLogoBackground, part.brandLogoNeedsReview) ? (
                          <img src={part.brandLogoUrl ?? ""} alt="" loading="lazy" />
                        ) : null}
                        <span>{part.brandName}</span>
                      </div>
                      <h3>
                        <a href={part.detailPath}>{part.name}</a>
                      </h3>
                      <div className="parts-card-meta">
                        <span>{part.priceLabel}</span>
                        {part.hpGainLabel ? <span>{part.hpGainLabel}</span> : null}
                      </div>
                      <div className="parts-card-actions">
                        <a href={part.detailPath}>View Details</a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="parts-trust-strip" aria-label="Parts store trust indicators">
                <article><span>◇</span><strong>Premium Quality</strong><small>Top-tier parts from trusted sources.</small></article>
                <article><span>◉</span><strong>Fitment First</strong><small>Model-aware catalog matching.</small></article>
                <article><span>▱</span><strong>Source Backed</strong><small>Real products, no fake inventory.</small></article>
                <article><span>⌁</span><strong>Build Ready</strong><small>Designed around garage workflows.</small></article>
              </div>

              {remainingParts.length > 0 ? (
                <div className="parts-card-grid parts-card-grid-secondary">
                  {remainingParts.map((part, index) => (
                <article key={part.id} className="parts-card">
                  <div className="parts-card-image">
                    {part.imageUrl ? (
                      <img src={part.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span>{part.categoryName}</span>
                    )}
                    <span className={`parts-card-badge badge-${index % 3}`}>{getProductBadge(index)}</span>
                  </div>
                  <div className="parts-card-body">
                    <div className="parts-card-brand">
                      {isCleanBrandLogo(part.brandLogoUrl, part.brandLogoBackground, part.brandLogoNeedsReview) ? (
                        <img src={part.brandLogoUrl ?? ""} alt="" loading="lazy" />
                      ) : null}
                      <span>{part.brandName}</span>
                    </div>
                    <h3>
                      <a href={part.detailPath}>{part.name}</a>
                    </h3>
                    {part.partNumber ? <p className="parts-card-sku">Part #{part.partNumber}</p> : null}
                    {part.description ? <p className="parts-card-description">{part.description}</p> : null}
                    <div className="parts-card-meta">
                      <span>{part.priceLabel}</span>
                      {part.hpGainLabel ? <span>{part.hpGainLabel}</span> : null}
                      {part.torqueGainLabel ? <span>{part.torqueGainLabel}</span> : null}
                    </div>
                    <div className="parts-fitment-list parts-fitment-list-compact">
                      {part.fitmentSummary ? (
                        <>
                          <span>{part.fitmentSummary}</span>
                          {part.fitmentCount > 1 ? <span>+{part.fitmentCount - 1} fitments</span> : null}
                        </>
                      ) : (
                        <span>Universal / unscoped fitment</span>
                      )}
                    </div>
                    <div className="parts-card-actions">
                      <a href={part.detailPath}>View Details</a>
                    </div>
                  </div>
                </article>
                  ))}
                </div>
              ) : null}
            </>
          )}
          </div>
          {catalogPage.totalPages > 1 ? (
            <nav className="parts-pagination" aria-label="Parts catalog pages">
              <button type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                Previous
              </button>
              <span>Page {catalogPage.page.toLocaleString()} of {catalogPage.totalPages.toLocaleString()}</span>
              <button type="button" disabled={page >= catalogPage.totalPages || isLoading} onClick={() => setPage((current) => current + 1)}>
                Next
              </button>
            </nav>
          ) : null}
        </section>

        <aside className="parts-build-panel" aria-label="Parts catalog status">
          <article className={`parts-featured-build-card${selectedGarageCar?.imageUrl ? " has-selected-car" : ""}`}>
            <span>Featured Build</span>
            <div className={`parts-featured-build-image${selectedGarageCar?.imageUrl ? " has-selected-car" : ""}`}>
              {selectedGarageCar?.imageUrl ? (
                <img src={selectedGarageCar.imageUrl} alt="" loading="lazy" />
              ) : null}
            </div>
            <h3>{selectedGarageCar?.label ?? "TRACK FURY"}</h3>
            <p>{selectedGarageCar?.detail ?? "V10 inspired | RWD stance | Build-ready catalog routing."}</p>
            <CarSelector
              garageCars={garageCars}
              activeGarageCarId={activeGarageCarId}
              makeOptions={makeOptions}
              modelOptions={modelOptions}
              activeMakeId={activeMakeId}
              activeModelId={activeModelId}
              shownCount={catalogPage.total}
              onGarageCarChange={(garageCarId) => {
                setActiveGarageCarId(garageCarId);
                const garageCar = garageCars.find((car) => car.id === garageCarId);
                if (!garageCar) {
                  setActiveMakeId("");
                  setActiveModelId("");
                  setPage(1);
                  return;
                }
                setActiveMakeId(garageCar.makeId);
                setActiveModelId(garageCar.modelId);
                setPage(1);
              }}
              onMakeChange={(value) => {
                setActiveGarageCarId("");
                setActiveMakeId(value);
                setActiveModelId("");
                setPage(1);
              }}
              onModelChange={(value) => {
                setActiveGarageCarId("");
                setActiveModelId(value);
                setPage(1);
              }}
            />
          </article>
          <article className="parts-progress-card">
            <div>
              <span>Build Progress</span>
              <strong>{buildProgressPercent}%</strong>
            </div>
            <div className="parts-progress-bar" aria-hidden="true">
              <span style={{ width: `${buildProgressPercent}%` }} />
            </div>
            <ul>
              {buildProgressRows.map((category) => (
                <li key={category.id}>
                  <span>
                    <CategoryLineIcon slug={category.slug} />
                    {category.name}
                  </span>
                  <strong>{category.partCount.toLocaleString()} / {Math.max(category.partCount + 2, 3).toLocaleString()}</strong>
                </li>
              ))}
            </ul>
          </article>
          <article className="parts-disclosure-card">
            <span>Partner Links Pending</span>
            <p>Purchase routing stays inactive until affiliate partners are approved.</p>
          </article>
        </aside>
      </section>
    </main>
  );
}

function BrandFilterButton({
  brand,
  isActive,
  onSelect,
}: {
  brand: PartsBrandRow;
  isActive: boolean;
  onSelect: () => void;
}) {
  const cleanLogoUrl = isCleanBrandLogo(brand.logoUrl, brand.logoBackground, brand.logoNeedsReview) ? brand.logoUrl : null;

  return (
    <button
      type="button"
      className={`parts-brand-chip${cleanLogoUrl ? " has-logo" : ""}${isActive ? " is-active" : ""}`}
      onClick={onSelect}
      title={brand.name}
    >
      {cleanLogoUrl ? <img src={cleanLogoUrl} alt="" loading="lazy" /> : null}
      <span className="parts-brand-wordmark">{brand.name}</span>
    </button>
  );
}

function CarSelector({
  garageCars,
  activeGarageCarId,
  makeOptions,
  modelOptions,
  activeMakeId,
  activeModelId,
  shownCount,
  onGarageCarChange,
  onMakeChange,
  onModelChange,
}: {
  garageCars: PartsGarageCarRow[];
  activeGarageCarId: string;
  makeOptions: Array<{ id: string; name: string; count: number }>;
  modelOptions: Array<{ id: string; name: string; makeId: string; count: number }>;
  activeMakeId: string;
  activeModelId: string;
  shownCount: number;
  onGarageCarChange: (value: string) => void;
  onMakeChange: (value: string) => void;
  onModelChange: (value: string) => void;
}) {
  return (
    <div className="parts-car-selector" aria-label="Selected car filter">
      <div className="parts-car-selector-heading">
        <span>Selected Car</span>
        <strong>{shownCount.toLocaleString()} parts</strong>
      </div>
      <label className="parts-garage-car-field">
        <span>Garage Car</span>
        <select value={activeGarageCarId} onChange={(event) => onGarageCarChange(event.target.value)}>
          <option value="">{garageCars.length > 0 ? "Choose from garage" : "No garage cars yet"}</option>
          {garageCars.map((car) => (
            <option key={car.id} value={car.id}>
              {car.label}{car.detail ? ` · ${car.detail}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Make</span>
        <select value={activeMakeId} onChange={(event) => onMakeChange(event.target.value)}>
          <option value="">All Makes</option>
          {makeOptions.map((make) => (
            <option key={make.id} value={make.id}>
              {make.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Model</span>
        <select
          value={activeModelId}
          onChange={(event) => onModelChange(event.target.value)}
          disabled={!activeMakeId}
        >
          <option value="">All Models</option>
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function isCleanBrandLogo(logoUrl: string | null, logoBackground: string, logoNeedsReview: boolean) {
  if (!logoUrl || logoNeedsReview) return false;
  if (logoUrl.startsWith("/parts/placeholders/brand/")) return false;
  return logoBackground === "TRANSPARENT";
}

function getProductBadge(index: number) {
  if (index % 7 === 0) return "New";
  if (index % 5 === 0) return "Top Rated";
  if (index % 3 === 0) return "Hot";
  return "Featured";
}

function sortShopCategories(categories: PartsCategoryRow[]) {
  return [...categories].sort((a, b) => {
    const aIndex = SHOP_CATEGORY_ORDER.indexOf(a.slug);
    const bIndex = SHOP_CATEGORY_ORDER.indexOf(b.slug);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
    }
    return a.name.localeCompare(b.name);
  });
}

function CategoryLineIcon({ slug }: { slug: string }) {
  return (
    <svg className="parts-category-line-icon" viewBox="0 0 48 48" aria-hidden="true">
      {getCategoryIconPaths(slug)}
    </svg>
  );
}

function getCategoryIconPaths(slug: string) {
  switch (slug) {
    case "intake":
      return (
        <>
          <path d="M8 28c8-16 21-20 32-12" />
          <path d="M15 31c5-9 13-13 23-9" />
          <path d="M28 18l9 17" />
          <path d="M34 21l6 12" />
          <circle cx="12" cy="32" r="5" />
        </>
      );
    case "exhaust":
      return (
        <>
          <path d="M7 29h16l7-8h11" />
          <path d="M24 29l7 8h10" />
          <path d="M36 17h6v8h-6z" />
          <path d="M36 33h6v8h-6z" />
          <path d="M8 23h7" />
        </>
      );
    case "ecu-tuning":
      return (
        <>
          <rect x="13" y="12" width="22" height="24" rx="3" />
          <path d="M19 18h10v12H19z" />
          <path d="M8 17h5M8 24h5M8 31h5M35 17h5M35 24h5M35 31h5" />
          <path d="M18 40v-4M24 40v-4M30 40v-4M18 12V8M24 12V8M30 12V8" />
        </>
      );
    case "forced-induction":
      return (
        <>
          <circle cx="22" cy="24" r="12" />
          <path d="M22 24c-3-2-5-4-4-7 5 1 9 3 10 7-2 5-6 7-11 7 0-3 2-5 5-7Z" />
          <path d="M32 17h8v9h-6" />
          <path d="M31 31l7 7" />
          <path d="M10 34H6v-8h4" />
        </>
      );
    case "brakes":
      return (
        <>
          <circle cx="24" cy="24" r="14" />
          <circle cx="24" cy="24" r="4" />
          <path d="M24 10v8M24 30v8M10 24h8M30 24h8" />
          <path d="M34 14c5 4 7 10 5 17l-7-2c1-4 0-8-3-11Z" />
        </>
      );
    case "suspension":
      return (
        <>
          <path d="M15 8h18" />
          <path d="M24 8v32" />
          <path d="M17 14c14 0 14 5 0 5s-14 5 0 5 14 5 0 5-14 5 0 5h14" />
          <path d="M15 40h18" />
        </>
      );
    case "wheels-tires":
      return (
        <>
          <circle cx="24" cy="24" r="15" />
          <circle cx="24" cy="24" r="5" />
          <path d="M24 9v10M24 29v10M9 24h10M29 24h10M14 14l7 7M27 27l7 7M34 14l-7 7M21 27l-7 7" />
        </>
      );
    case "aero-body":
      return (
        <>
          <path d="M7 31h34" />
          <path d="M12 31l5-13 22-4-5 12" />
          <path d="M20 18l-2 13" />
          <path d="M33 15l-2 16" />
          <path d="M9 36h8M31 36h8" />
        </>
      );
    case "drivetrain":
      return (
        <>
          <circle cx="17" cy="24" r="8" />
          <circle cx="31" cy="24" r="8" />
          <path d="M17 16v-6M17 38v-6M9 24H3M31 16v-6M31 38v-6M45 24h-6M22 24h4" />
          <path d="M12 19l10 10M22 19 12 29M26 19l10 10M36 19 26 29" />
        </>
      );
    case "interior-safety":
      return (
        <>
          <path d="M20 8h8l3 18h-9l-5 13H9l7-17Z" />
          <path d="M23 26h13l3 13H18" />
          <path d="M31 9c5 4 7 10 5 17" />
        </>
      );
    case "fueling":
      return (
        <>
          <path d="M15 10h17v28H15z" />
          <path d="M18 14h11v8H18z" />
          <path d="M32 16h5l3 5v15c0 3-4 3-4 0V25h-4" />
          <path d="M20 31h7" />
        </>
      );
    case "cooling":
      return (
        <>
          <circle cx="24" cy="24" r="4" />
          <path d="M24 8c5 6 5 11 0 16M24 40c-5-6-5-11 0-16M8 24c6-5 11-5 16 0M40 24c-6 5-11 5-16 0" />
          <path d="M12 12l24 24M36 12 12 36" />
        </>
      );
    default:
      return (
        <>
          <circle cx="24" cy="24" r="14" />
          <path d="M17 24h14M24 17v14" />
        </>
      );
  }
}
