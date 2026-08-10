"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

export type PartsCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  partCount: number;
};

export type PartsBrandRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  country: string | null;
  partCount: number;
};

export type PartsStorePartRow = {
  id: string;
  name: string;
  partNumber: string | null;
  description: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  status: string;
  priceLabel: string;
  hpGainLabel: string | null;
  torqueGainLabel: string | null;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  brandLogoUrl: string | null;
  compatibility: string[];
  trackingEnabled: boolean;
};

type PartsStoreExplorerProps = {
  categories: PartsCategoryRow[];
  brands: PartsBrandRow[];
  parts: PartsStorePartRow[];
};

export function PartsStoreExplorer({ categories, brands, parts }: PartsStoreExplorerProps) {
  const [activeCategoryId, setActiveCategoryId] = useState(categories[0]?.id ?? "");
  const [activeBrandId, setActiveBrandId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0] ?? null;
  const categoryScopedParts = parts.filter((part) => !activeCategoryId || part.categoryId === activeCategoryId);
  const visibleBrands = useMemo(() => {
    const brandIds = new Set(categoryScopedParts.map((part) => part.brandId));
    return brands.filter((brand) => brandIds.has(brand.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [brands, categoryScopedParts]);

  const filteredParts = categoryScopedParts.filter((part) => {
    if (activeBrandId && part.brandId !== activeBrandId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const haystack = [
        part.name,
        part.partNumber,
        part.description,
        part.categoryName,
        part.brandName,
        ...part.compatibility,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const resetFilters = () => {
    setActiveCategoryId(categories[0]?.id ?? "");
    setActiveBrandId("");
    setSearchQuery("");
  };

  return (
    <main className="parts-store-shell">
      <section className="parts-store-hero">
        <div>
          <p className="garage-page-eyebrow">Parts Shop</p>
          <h1>Build Your Setup</h1>
          <p>
            Browse performance categories, trusted aftermarket brands, and model-aware parts. Affiliate checkout is intentionally inactive until partner programs are approved.
          </p>
        </div>
        <div className="parts-store-stats" aria-label="Parts catalog summary">
          <article>
            <span>Categories</span>
            <strong>{categories.length.toLocaleString()}</strong>
          </article>
          <article>
            <span>Brands</span>
            <strong>{brands.length.toLocaleString()}</strong>
          </article>
          <article>
            <span>Parts</span>
            <strong>{parts.length.toLocaleString()}</strong>
          </article>
        </div>
      </section>

      <section className="parts-store-layout" aria-label="Parts catalog browser">
        <aside className="parts-category-panel">
          <div className="parts-panel-heading">
            <span>Category</span>
            <button type="button" onClick={resetFilters}>Reset</button>
          </div>
          <div className="parts-category-list">
            {categories.map((category) => {
              const isActive = category.id === activeCategory?.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`parts-category-button${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    setActiveCategoryId(category.id);
                    setActiveBrandId("");
                  }}
                >
                  <span>{category.name}</span>
                  <small>{category.partCount.toLocaleString()}</small>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="parts-results-panel">
          <div className="parts-results-header">
            <div>
              <p className="garage-page-eyebrow">{activeCategory?.name ?? "Catalog"}</p>
              <h2>{activeCategory?.description ?? "Select a category to browse performance parts."}</h2>
            </div>
            <label className="parts-search-field">
              <span>Search</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Part, brand, model, fitment"
              />
            </label>
          </div>

          <div className="parts-brand-strip" aria-label="Brands in selected category">
            <button
              type="button"
              className={`parts-brand-chip${activeBrandId === "" ? " is-active" : ""}`}
              onClick={() => setActiveBrandId("")}
            >
              All Brands
            </button>
            {visibleBrands.map((brand) => (
              <button
                key={brand.id}
                type="button"
                className={`parts-brand-chip${activeBrandId === brand.id ? " is-active" : ""}`}
                onClick={() => setActiveBrandId(brand.id)}
              >
                {brand.logoUrl ? <img src={brand.logoUrl} alt="" loading="lazy" /> : null}
                <span>{brand.name}</span>
              </button>
            ))}
            {visibleBrands.length === 0 ? (
              <span className="parts-empty-chip">No brands captured in this category yet</span>
            ) : null}
          </div>

          {filteredParts.length === 0 ? (
            <div className="parts-empty-state">
              <h3>No parts captured yet</h3>
              <p>
                This category is ready. Add real parts from the admin Parts tab with source URLs, fitment, and verified estimates before anything appears here.
              </p>
            </div>
          ) : (
            <div className="parts-card-grid">
              {filteredParts.map((part) => (
                <article key={part.id} className="parts-card">
                  <div className="parts-card-image">
                    {part.imageUrl ? (
                      <img src={part.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span>{part.categoryName}</span>
                    )}
                  </div>
                  <div className="parts-card-body">
                    <div className="parts-card-brand">
                      {part.brandLogoUrl ? <img src={part.brandLogoUrl} alt="" loading="lazy" /> : null}
                      <span>{part.brandName}</span>
                    </div>
                    <h3>{part.name}</h3>
                    {part.partNumber ? <p className="parts-card-sku">Part #{part.partNumber}</p> : null}
                    {part.description ? <p className="parts-card-description">{part.description}</p> : null}
                    <div className="parts-card-meta">
                      <span>{part.priceLabel}</span>
                      {part.hpGainLabel ? <span>{part.hpGainLabel}</span> : null}
                      {part.torqueGainLabel ? <span>{part.torqueGainLabel}</span> : null}
                    </div>
                    <div className="parts-fitment-list">
                      {part.compatibility.length > 0 ? (
                        part.compatibility.slice(0, 3).map((fitment) => <span key={fitment}>{fitment}</span>)
                      ) : (
                        <span>Universal / unscoped fitment</span>
                      )}
                    </div>
                    <div className="parts-card-actions">
                      {part.sourceUrl ? (
                        <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer">
                          Review Source
                        </a>
                      ) : (
                        <span>No source link</span>
                      )}
                      <button type="button" disabled>
                        Affiliate Pending
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
