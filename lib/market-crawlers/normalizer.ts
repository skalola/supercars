import type {
  AllowedCrawlerMake,
  NormalizedCrawlerListing,
  RawCrawlerListing,
} from "./types";
import { cleanVin } from "./vin-extractor";

const ALLOWED_MAKES: AllowedCrawlerMake[] = ["Ferrari", "Lamborghini"];

export function normalizeAllowedMake(value: string | null | undefined): AllowedCrawlerMake | null {
  if (!value) return null;
  const text = value.toLowerCase();
  if (text.includes("ferrari")) return "Ferrari";
  if (text.includes("lamborghini")) return "Lamborghini";
  return null;
}

export function inferYear(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\b(19[8-9]\d|20[0-3]\d)\b/);
  return match ? Number(match[1]) : null;
}

export function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseMileage(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function absolutizeUrl(url: string | null | undefined, pageUrl: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, pageUrl).toString();
  } catch {
    return null;
  }
}

export function inferModel(make: AllowedCrawlerMake, rawModel: string | null, title: string | null): string | null {
  const candidate = [rawModel, title].find((part) => part && part.trim().length > 0);
  if (!candidate) return null;

  let text = candidate
    .replace(/\b(19[8-9]\d|20[0-3]\d)\b/g, "")
    .replace(new RegExp(make, "gi"), "")
    .replace(/\b(for sale|used|new|certified|pre-owned|coupe|convertible|spider|spyder)\b/gi, " ")
    .replace(/[|,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text && rawModel) text = rawModel.trim();
  return text || null;
}

export function inferTrim(model: string, rawTrim: string | null, title: string | null): string | null {
  if (rawTrim?.trim()) return rawTrim.trim();
  if (!title) return null;

  const escapedModel = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = title.match(new RegExp(`${escapedModel}\\s+([A-Za-z0-9][A-Za-z0-9 +.-]{1,30})`, "i"));
  if (!match) return null;

  const trim = match[1]
    .replace(/\b(for sale|used|new|certified|pre-owned|coupe|convertible)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return trim || null;
}

export function normalizeListing(raw: RawCrawlerListing): NormalizedCrawlerListing | null {
  const vin = cleanVin(raw.vin);
  if (!vin) return null;

  const title = [raw.year, raw.make, raw.model, raw.title].filter(Boolean).join(" ");
  
  let make = normalizeAllowedMake(raw.make) ?? normalizeAllowedMake(raw.title) ?? normalizeAllowedMake(title);
  
  // Override make based on VIN prefix to prevent false make identification on mixed lists/footers
  if (vin) {
    const upperVin = vin.toUpperCase();
    if (upperVin.startsWith("ZFF") || upperVin.startsWith("ZFA")) {
      make = "Ferrari";
    } else if (upperVin.startsWith("ZHW")) {
      make = "Lamborghini";
    }
  }

  if (!make || !ALLOWED_MAKES.includes(make)) return null;

  const year = raw.year ?? inferYear(title);
  if (!year) return null;

  // Clean up any occurrences of the other make from the raw model name
  let rawModel = raw.model;
  if (rawModel) {
    const wrongMake = make === "Ferrari" ? "Lamborghini" : "Ferrari";
    rawModel = rawModel.replace(new RegExp(wrongMake, "gi"), "").replace(/\s+/g, " ").trim();
  }

  const model = inferModel(make, rawModel, raw.title);
  if (!model) return null;
  const trim = inferTrim(model, raw.trim, raw.title);

  const url = absolutizeUrl(raw.url, raw.pageUrl) ?? raw.pageUrl;
  const externalListingId = raw.externalListingId ?? `${raw.sourceName}:${vin}:${url}`;

  return {
    sourceName: raw.sourceName,
    sourceType: raw.sourceType,
    sourceKey: `${raw.sourceName}:${url}`,
    externalListingId,
    vin,
    year,
    make,
    model,
    trim,
    price: raw.price,
    mileage: raw.mileage,
    color: raw.color,
    location: raw.location,
    dealerName: raw.dealerName,
    url,
    images: raw.images,
  };
}
