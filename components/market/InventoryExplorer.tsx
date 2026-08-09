"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getVehicleHeroImage, isNonVehicleImageUrl } from "@/lib/vehicle-images";

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
    photos: Array<{ id: string; filePath: string; isHero: boolean }>;
    images: Array<{ id: string; url: string; isPrimary: boolean; validationStatus?: string | null }>;
    model?: {
      images?: Array<{ url: string; type: string | null }> | null;
    } | null;
  } | null;
  model: ModelObj;
};

type InventoryExplorerProps = {
  listings: ListingObj[];
  makes: MakeObj[];
  models: ModelObj[];
};

function getListingImage(listing: ListingObj) {
  const vehicleHero = getVehicleHeroImage(listing.vehicle);
  if (vehicleHero && vehicleHero !== "/images/placeholder.jpg") return vehicleHero;
  if (listing.imageUrl && !isNonVehicleImageUrl(listing.imageUrl)) return listing.imageUrl;
  return "/images/placeholder.jpg";
}

export default function InventoryExplorer({
  listings,
  makes,
  models,
}: InventoryExplorerProps) {
  const [selectedMakeId, setSelectedMakeId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  // Dynamically filter models list based on selected make
  const filteredModels = selectedMakeId
    ? models.filter((m) => m.makeId === selectedMakeId)
    : models;

  // Filter listings
  const filteredListings = listings.filter((l) => {
    if (selectedMakeId && l.model.makeId !== selectedMakeId) return false;
    if (selectedModelId && l.modelId !== selectedModelId) return false;
    if (selectedYear && l.year.toString() !== selectedYear) return false;

    const price = l.askingPrice || l.price || 0;
    if (minPrice && price < parseFloat(minPrice)) return false;
    if (maxPrice && price > parseFloat(maxPrice)) return false;

    return true;
  });

  // Get unique years list from listings for filter
  const uniqueYears = Array.from(new Set(listings.map((l) => l.year))).sort((a, b) => b - a);
  const visibleValue = filteredListings.reduce((sum, listing) => sum + (listing.askingPrice || listing.price || 0), 0);
  const activeFilters = [selectedMakeId, selectedModelId, selectedYear, minPrice, maxPrice].filter(Boolean).length;

  const resetFilters = () => {
    setSelectedMakeId("");
    setSelectedModelId("");
    setSelectedYear("");
    setMinPrice("");
    setMaxPrice("");
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
            <strong>{filteredListings.length}</strong>
          </article>
          <article>
            <span>Value</span>
            <strong>{formatCompactCurrency(visibleValue)}</strong>
          </article>
          <article>
            <span>Filters</span>
            <strong>{activeFilters}</strong>
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
              setSelectedMakeId(e.target.value);
              setSelectedModelId(""); // Reset model when make changes
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
            onChange={(e) => setSelectedModelId(e.target.value)}
          >
            <option value="">All Models</option>
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
            onChange={(e) => setSelectedYear(e.target.value)}
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
            />
            <span>&ndash;</span>
            <input
              type="number"
              placeholder="Max"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>
        </div>
      </aside>

      {/* Main Content Listings Area */}
      <main>
        <div className="market-results-header inventory-results-header">
          <h2>
            Available Vehicles
          </h2>
          <span>
            {filteredListings.length} {filteredListings.length === 1 ? "listing" : "listings"} found
          </span>
        </div>

        {filteredListings.length === 0 ? (
          <div className="market-empty-state">
            <h3>No listings found</h3>
            <p>Try adjusting your filters or search criteria.</p>
          </div>
        ) : (
          <div className="inventory-card-grid">
            {filteredListings.map((lst) => {
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
      </main>
      </div>
    </div>
  );
}

function formatCompactCurrency(value: number) {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1,
    notation: value >= 1000000 ? "compact" : "standard",
  }).format(value);
}
