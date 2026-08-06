"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getVehicleHeroImage } from "@/lib/vehicle-images";

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
    images: Array<{ id: string; url: string; isPrimary: boolean }>;
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
  if (listing.imageUrl) return listing.imageUrl;
  return getVehicleHeroImage(listing.vehicle);
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

  const resetFilters = () => {
    setSelectedMakeId("");
    setSelectedModelId("");
    setSelectedYear("");
    setMinPrice("");
    setMaxPrice("");
  };

  return (
    <div className="page-shell wide inventory-shell">
      {/* Filters Sidebar */}
      <aside className="inventory-filter-panel" style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "24px",
        backgroundColor: "#fff",
        height: "fit-content",
        display: "flex",
        flexDirection: "column",
        gap: "20px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#111827", margin: 0 }}>Filters</h3>
          <button
            onClick={resetFilters}
            style={{
              background: "none",
              border: "none",
              color: "#2563eb",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              padding: 0
            }}
          >
            Reset All
          </button>
        </div>

        {/* Make Filter */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px", textTransform: "uppercase" }}>Make</label>
          <select
            value={selectedMakeId}
            onChange={(e) => {
              setSelectedMakeId(e.target.value);
              setSelectedModelId(""); // Reset model when make changes
            }}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", backgroundColor: "#fff", outline: "none" }}
          >
            <option value="">All Makes</option>
            {makes.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Model Filter */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px", textTransform: "uppercase" }}>Model</label>
          <select
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", backgroundColor: "#fff", outline: "none" }}
          >
            <option value="">All Models</option>
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Year Filter */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px", textTransform: "uppercase" }}>Year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", backgroundColor: "#fff", outline: "none" }}
          >
            <option value="">All Years</option>
            {uniqueYears.map((yr) => (
              <option key={yr} value={yr.toString()}>{yr}</option>
            ))}
          </select>
        </div>

        {/* Price Range Filters */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "6px", textTransform: "uppercase" }}>Price Range ($)</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="number"
              placeholder="Min"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              style={{ width: "100%", padding: "10px 8px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", outline: "none" }}
            />
            <span style={{ color: "#94a3b8" }}>&ndash;</span>
            <input
              type="number"
              placeholder="Max"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              style={{ width: "100%", padding: "10px 8px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", outline: "none" }}
            />
          </div>
        </div>
      </aside>

      {/* Main Content Listings Area */}
      <main>
        <div className="inventory-results-header" style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#111827", margin: 0 }}>
            Available Vehicles
          </h2>
          <span style={{ fontSize: "14px", color: "#64748b", fontWeight: 600 }}>
            {filteredListings.length} {filteredListings.length === 1 ? "listing" : "listings"} found
          </span>
        </div>

        {filteredListings.length === 0 ? (
          <div style={{
            border: "2px dashed #cbd5e1",
            borderRadius: "16px",
            padding: "48px 24px",
            textAlign: "center",
            color: "#64748b"
          }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 6px 0", color: "#1e293b" }}>No listings found</h3>
            <p style={{ fontSize: "14px", margin: 0 }}>Try adjusting your filters or search criteria.</p>
          </div>
        ) : (
          <div className="inventory-card-grid">
            {filteredListings.map((lst) => {
              const image = getListingImage(lst);
              const price = lst.askingPrice || lst.price || null;
              return (
                <div
                  key={lst.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    {image ? (
                      <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", backgroundColor: "#f3f4f6" }}>
                        <Image
                          src={image}
                          alt={`${lst.year} ${lst.model.make.name} ${lst.model.name}`}
                          fill
                          sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
                          style={{ objectFit: "cover" }}
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div style={{
                        width: "100%",
                        paddingTop: "56.25%",
                        backgroundColor: "#f3f4f6",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#9ca3af",
                        fontSize: "14px",
                        position: "relative"
                      }}>
                        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
                          No image
                        </div>
                      </div>
                    )}
                    <div style={{ padding: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "8px" }}>
                        <span style={{
                          backgroundColor: "#fef3c7",
                          color: "#d97706",
                          fontSize: "11px",
                          fontWeight: "bold",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          textTransform: "uppercase"
                        }}>
                          FOR SALE
                        </span>
                        {price !== null && (
                          <span style={{ fontWeight: 800, color: "#10b981", fontSize: "16px" }}>
                            ${price.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 6px 0", color: "#111827" }}>
                        {lst.year} {lst.model.make.name} {lst.model.name}
                      </h3>
                      <div style={{ fontSize: "13px", color: "#6b7280" }}>
                        {lst.mileage !== null ? `${lst.mileage.toLocaleString()} miles` : "Mileage unavailable"}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "16px", paddingTop: 0 }}>
                    {lst.url ? (
                      <a
                        href={lst.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block",
                          marginBottom: "10px",
                          color: "#1d4ed8",
                          fontSize: "12px",
                          fontWeight: 700,
                          textDecoration: "underline",
                          textUnderlineOffset: "3px",
                        }}
                      >
                        View original listing
                      </a>
                    ) : null}
                    <Link
                      href={`/vehicle/${lst.vehicle?.vin}`}
                      style={{
                        display: "block",
                        textAlign: "center",
                        backgroundColor: "#2563eb",
                        color: "#ffffff",
                        padding: "10px 16px",
                        borderRadius: "6px",
                        fontSize: "14px",
                        fontWeight: 600,
                        textDecoration: "none",
                        transition: "background-color 0.2s"
                      }}
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
  );
}
