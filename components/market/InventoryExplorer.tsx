"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isNonVehicleImageUrl } from "@/lib/vehicle-images";

type MakeObj = {
  id: string;
  name: string;
  slug: string;
};

type ModelObj = {
  id: string;
  name: string;
  slug: string;
  makeId: string;
  make: MakeObj;
};

type ListingObj = {
  id: string;
  modelId: string;
  imageUrl?: string | null;
  year: number;
  price: number | null;
  mileage: number | null;
  color: string | null;
  askingPrice: number | null;
  url?: string | null;
  vehicleId: string | null;
  vehicle: {
    vin: string;
    heroImageUrl: string | null;
  } | null;
  model: ModelObj;
};

type InventoryExplorerProps = {
  listings: ListingObj[];
  makes: MakeObj[];
  models: ModelObj[];
  availableYears: number[];
  totalListings: number;
  totalValue: number;
  page: number;
  pageSize: number;
  initialMake?: string;
  initialModel?: string;
  initialYear?: string;
  initialMinPrice?: string;
  initialMaxPrice?: string;
};

function getListingImage(listing: ListingObj) {
  if (listing.vehicle?.heroImageUrl && !isNonVehicleImageUrl(listing.vehicle.heroImageUrl)) {
    return listing.vehicle.heroImageUrl;
  }
  if (listing.imageUrl && !isNonVehicleImageUrl(listing.imageUrl)) return listing.imageUrl;
  return "/images/placeholder.jpg";
}

export default function InventoryExplorer({
  listings,
  makes,
  models,
  availableYears,
  totalListings,
  totalValue,
  page,
  pageSize,
  initialMake,
  initialModel,
  initialYear,
  initialMinPrice,
  initialMaxPrice,
}: InventoryExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialMakeId = resolveMakeId(makes, initialMake);
  const initialModelId = resolveModelId(models, initialModel, initialMakeId);
  const selectedMakeId = initialMakeId;
  const selectedModelId = initialModelId;
  const selectedYear = initialYear || "";
  const [minPrice, setMinPrice] = useState(initialMinPrice || "");
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice || "");

  // Dynamically filter models list based on selected make
  const filteredModels = useMemo(
    () => (selectedMakeId ? models.filter((m) => m.makeId === selectedMakeId) : models),
    [models, selectedMakeId]
  );

  const uniqueYears = useMemo(
    () => Array.from(new Set(availableYears)).sort((a, b) => b - a),
    [availableYears]
  );
  const totalPages = Math.max(1, Math.ceil(totalListings / pageSize));
  const pageStart = totalListings === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(totalListings, page * pageSize);

  const resetFilters = () => {
    setMinPrice("");
    setMaxPrice("");
    router.push(pathname, { scroll: false });
  };

  const updateFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (targetPage > 1) {
      params.set("page", targetPage.toString());
    } else {
      params.delete("page");
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const applyPriceFilters = () => {
    updateFilters({
      minPrice: minPrice.trim() || null,
      maxPrice: maxPrice.trim() || null,
    });
  };

  return (
    <div className="market-page-shell">
      <section className="market-hero">
        <div>
          <div className="market-eyebrow">Market</div>
          <h1>VIN-Backed Supercar Market</h1>
          <p>Live Ferrari, Lamborghini, and McLaren inventory with verified VINs, prices, photos, and source links.</p>
        </div>
        <div className="market-stat-grid" aria-label="Market summary">
          <article>
            <span>Listings</span>
            <strong>{totalListings}</strong>
          </article>
          <article>
            <span>Value</span>
            <strong className="market-value-number">{formatFullCurrency(totalValue)}</strong>
          </article>
        </div>
      </section>

      <div className="market-layout">
      {/* Filters Sidebar */}
      <aside className="market-filter-panel inventory-filter-panel">
        <div className="market-filter-header">
          <h3>Filters</h3>
          <button
            onClick={resetFilters}
            className="market-reset-button"
          >
            Reset All
          </button>
        </div>

        {/* Make Filter */}
        <div className="market-filter-field">
          <label>Make</label>
          <select
            value={selectedMakeId}
            onChange={(e) => {
              const make = makes.find((m) => m.id === e.target.value);
              updateFilters({
                make: make?.slug || null,
                model: null,
              });
            }}
          >
            <option value="">All Makes</option>
            {makes.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Model Filter */}
        <div className="market-filter-field">
          <label>Model</label>
          <select
            value={selectedModelId}
            disabled={!selectedMakeId}
            onChange={(e) => {
              const model = models.find((m) => m.id === e.target.value);
              updateFilters({ model: model?.slug || null });
            }}
          >
            <option value="">{selectedMakeId ? "All Models" : "Choose Make First"}</option>
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Year Filter */}
        <div className="market-filter-field">
          <label>Year</label>
          <select
            value={selectedYear}
            onChange={(e) => updateFilters({ year: e.target.value || null })}
          >
            <option value="">All Years</option>
            {uniqueYears.map((yr) => (
              <option key={yr} value={yr.toString()}>{yr}</option>
            ))}
          </select>
        </div>

        {/* Price Range Filters */}
        <div className="market-filter-field">
          <label>Price Range</label>
          <div className="market-price-inputs">
            <input
              type="number"
              placeholder="Min"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyPriceFilters();
              }}
            />
            <span>&ndash;</span>
            <input
              type="number"
              placeholder="Max"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyPriceFilters();
              }}
            />
          </div>
          <button type="button" className="market-filter-apply-button" onClick={applyPriceFilters}>
            Apply Price
          </button>
        </div>
      </aside>

      {/* Main Content Listings Area */}
      <main>
        <div className="market-results-header inventory-results-header">
          <h2>
            Available Vehicles
          </h2>
          <span>
            {totalListings === 0
              ? "No listings found"
              : `Showing ${pageStart}-${pageEnd} of ${totalListings} ${totalListings === 1 ? "listing" : "listings"}`}
          </span>
        </div>

        {listings.length === 0 ? (
          <div className="market-empty-state">
            <h3>No listings found</h3>
            <p>Try adjusting your filters or search criteria.</p>
          </div>
        ) : (
          <div className="inventory-card-grid">
            {listings.map((lst) => {
              const image = getListingImage(lst);
              const price = lst.askingPrice || lst.price || null;
              return (
                <div
                  key={lst.id}
                  className="market-listing-card"
                >
                  <div>
                    {image ? (
                      <div className="market-listing-image">
                        <Image
                          src={image}
                          alt={`${lst.year} ${lst.model.make.name} ${lst.model.name}`}
                          fill
                          sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="market-listing-image">
                        <div>No image</div>
                      </div>
                    )}
                    <div className="market-listing-body">
                      <div className="market-listing-meta-row">
                        <span className="market-sale-pill">
                          FOR SALE
                        </span>
                        {price !== null && (
                          <span className="market-listing-price">
                            ${price.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <h3>
                        {lst.year} {lst.model.make.name} {lst.model.name}
                      </h3>
                      <div className="market-listing-detail">
                        {lst.mileage !== null ? `${lst.mileage.toLocaleString()} miles` : "Mileage unavailable"}
                      </div>
                    </div>
                  </div>
                  <div className="market-listing-actions">
                    {lst.url ? (
                      <a
                        href={lst.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="market-source-link"
                      >
                        View original listing
                      </a>
                    ) : null}
                    <Link
                      href={`/vehicle/${lst.vehicle?.vin}`}
                      className="market-card-button"
                    >
                      View Vehicle
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {totalPages > 1 ? (
          <nav className="market-pagination" aria-label="Inventory pages">
            <Link
              href={buildPageHref(Math.max(1, page - 1))}
              className={page <= 1 ? "market-pagination-link is-disabled" : "market-pagination-link"}
              aria-disabled={page <= 1}
            >
              Previous
            </Link>
            <span>
              Page {page} of {totalPages}
            </span>
            <Link
              href={buildPageHref(Math.min(totalPages, page + 1))}
              className={page >= totalPages ? "market-pagination-link is-disabled" : "market-pagination-link"}
              aria-disabled={page >= totalPages}
            >
              Next
            </Link>
          </nav>
        ) : null}
      </main>
      </div>
    </div>
  );
}

function formatFullCurrency(value: number) {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function resolveMakeId(makes: MakeObj[], value?: string) {
  const normalized = normalizeFilterValue(value);
  if (!normalized) return "";

  return (
    makes.find((make) =>
      [make.id, make.slug, make.name].some((candidate) => normalizeFilterValue(candidate) === normalized)
    )?.id || ""
  );
}

function resolveModelId(models: ModelObj[], value?: string, makeId?: string) {
  const normalized = normalizeFilterValue(value);
  if (!normalized) return "";

  return (
    models.find((model) => {
      if (makeId && model.makeId !== makeId) return false;
      return [model.id, model.slug, model.name].some((candidate) => normalizeFilterValue(candidate) === normalized);
    })?.id || ""
  );
}

function normalizeFilterValue(value?: string) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "";
}
