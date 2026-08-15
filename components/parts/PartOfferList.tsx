"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { CategoryLineIcon } from "./PartsStoreExplorer";

export type PartOfferProduct = {
  key: string;
  brand: string | null;
  productName: string;
  manufacturerPartNumber: string | null;
  oemPartNumber: string | null;
  qualityTier: string;
  imageUrl: string | null;
  fromPriceCents: number | null;
  currency: string;
  sellerCount: number;
  primaryOffer: {
    provider: string;
    condition: string | null;
    fitmentConfidence: string;
    buyUrl: string;
  };
};

type SortColumn = "part" | "quality" | "brand" | "price";
type SortDirection = "ascending" | "descending";

export function PartOfferList({ products, systemSlug }: { products: PartOfferProduct[]; systemSlug: string }) {
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({ column: "price", direction: "ascending" });
  const sortedProducts = useMemo(() => [...products].sort((left, right) => {
    if (sort.column === "price") {
      if (left.fromPriceCents == null && right.fromPriceCents != null) return 1;
      if (right.fromPriceCents == null && left.fromPriceCents != null) return -1;
    }
    const difference = compareProducts(left, right, sort.column);
    return sort.direction === "ascending" ? difference : -difference;
  }), [products, sort]);

  function changeSort(column: SortColumn) {
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === "ascending" ? "descending" : "ascending",
    }));
  }

  return (
    <div className="part-offer-list-shell">
      <table className="part-offer-list">
        <thead>
          <tr>
            <th scope="col" aria-sort={sort.column === "part" ? sort.direction : "none"}>
              <SortButton label="Part" column="part" sort={sort} onSort={changeSort} />
            </th>
            <th scope="col" aria-sort={sort.column === "quality" ? sort.direction : "none"}>
              <SortButton label="Quality" column="quality" sort={sort} onSort={changeSort} />
            </th>
            <th scope="col" aria-sort={sort.column === "brand" ? sort.direction : "none"}>
              <SortButton label="Brand" column="brand" sort={sort} onSort={changeSort} />
            </th>
            <th scope="col" aria-sort={sort.column === "price" ? sort.direction : "none"}>
              <SortButton label="Price" column="price" sort={sort} onSort={changeSort} />
            </th>
            <th scope="col"><span className="sr-only">Retailer link</span></th>
          </tr>
        </thead>
        <tbody>
          {sortedProducts.map((product) => (
            <tr key={product.key}>
              <td data-label="Part">
                <div className="part-offer-product">
                  <div className="part-offer-product-image">
                    {product.imageUrl ? <img src={product.imageUrl} alt={product.productName} loading="lazy" /> : <CategoryLineIcon slug={systemSlug} />}
                  </div>
                  <div className="part-offer-product-copy">
                    <strong>{product.productName}</strong>
                    <span>{formatPartNumber(product)}</span>
                    <small>{product.primaryOffer.condition || "Condition not listed"}{product.sellerCount > 1 ? ` · ${product.sellerCount} sellers` : ""}</small>
                  </div>
                </div>
              </td>
              <td data-label="Quality"><span className={`part-offer-quality is-${productQualityLabel(product).toLowerCase()}`}>{productQualityLabel(product)}</span></td>
              <td data-label="Brand"><strong className="part-offer-brand">{brandLabel(product)}</strong></td>
              <td data-label="Price"><strong className="part-offer-list-price">{formatMoney(product.fromPriceCents, product.currency)}</strong></td>
              <td data-label="Link"><a className="part-offer-retailer-link" href={product.primaryOffer.buyUrl} target="_blank" rel="nofollow sponsored">View at {providerLabel(product.primaryOffer.provider)}</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortButton({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sort: { column: SortColumn; direction: SortDirection };
  onSort: (column: SortColumn) => void;
}) {
  const active = sort.column === column;
  return (
    <button type="button" className={active ? "is-active" : ""} onClick={() => onSort(column)}>
      {label} <span aria-hidden="true">{active ? (sort.direction === "ascending" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

function compareProducts(left: PartOfferProduct, right: PartOfferProduct, column: SortColumn) {
  if (column === "part") return left.productName.localeCompare(right.productName);
  if (column === "quality") return qualityRank(productQualityLabel(left)) - qualityRank(productQualityLabel(right));
  if (column === "brand") return brandLabel(left).localeCompare(brandLabel(right));
  if (left.fromPriceCents == null && right.fromPriceCents == null) return left.productName.localeCompare(right.productName);
  if (left.fromPriceCents == null || right.fromPriceCents == null) return 0;
  return left.fromPriceCents - right.fromPriceCents;
}

function qualityRank(value: string) {
  return ({ Good: 1, Better: 2, Best: 3 } as Record<string, number>)[value] ?? 0;
}

function qualityLabel(tier: string) {
  if (["OEM", "BEST"].includes(tier.toUpperCase())) return "Best";
  if (tier.toUpperCase() === "BETTER") return "Better";
  return "Good";
}

function productQualityLabel(product: PartOfferProduct) {
  const brand = brandLabel(product);
  if (brand === "OEM") return "Best";
  if (brand === "Generic") return "Good";
  return qualityLabel(product.qualityTier);
}

function brandLabel(product: PartOfferProduct) {
  if (product.qualityTier.toUpperCase() === "OEM") return "OEM";
  if (product.brand && !/^(unknown|unbranded|generic)$/i.test(product.brand.trim())) return product.brand;
  if (product.primaryOffer.provider.toUpperCase() === "SCUDERIA") return "Scuderia";
  return "Generic";
}

function formatPartNumber(product: PartOfferProduct) {
  if (product.manufacturerPartNumber) return `MPN ${product.manufacturerPartNumber}`;
  if (product.oemPartNumber) return `OEM ${product.oemPartNumber}`;
  return "Part number not listed";
}

function formatMoney(value: number | null, currency: string) {
  return value == null ? "Price unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value / 100);
}

function providerLabel(value: string) {
  return value.toUpperCase() === "EBAY" ? "eBay" : value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
