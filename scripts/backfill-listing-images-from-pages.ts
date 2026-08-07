import { prisma } from "@/lib/prisma";
import { validateVehicleImageContentFromUrl } from "@/lib/data-quality/vehicle-image-content-validator";
import { isKnownInactiveListingUrl } from "@/lib/inventory/listing-url-quality";
import { normalizeSupportedMake, SUPPORTED_MAKES } from "@/lib/supported-makes";

const makeArg = process.argv.find((arg) => arg.startsWith("--make="))?.split("=")[1];
const vinArg = process.argv.find((arg) => arg.startsWith("--vin="))?.split("=")[1]?.toUpperCase();
const limitArg = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 100);
const maxImagesArg = Number(process.argv.find((arg) => arg.startsWith("--max-images="))?.split("=")[1] ?? 12);
const updateExistingImages = process.argv.includes("--update-existing-images");
const validateExistingImages = process.argv.includes("--validate-existing-images");
const updatePrices = process.argv.includes("--update-prices");
const includeExistingGallery = process.argv.includes("--include-existing-gallery");
const targetMakes = makeArg
  ? [normalizeSupportedMake(makeArg)].filter((make): make is (typeof SUPPORTED_MAKES)[number] => Boolean(make))
  : [...SUPPORTED_MAKES];
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 100;
const maxImages = Number.isFinite(maxImagesArg) && maxImagesArg > 0 ? Math.min(Math.round(maxImagesArg), 24) : 12;

const HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

async function main() {
  if (targetMakes.length === 0) throw new Error(`Unsupported make: ${makeArg}`);

  const vehicleFilter: Record<string, unknown> = {
    inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
    model: {
      make: {
        name: { in: targetMakes },
      },
    },
  };
  if (vinArg) vehicleFilter.vin = vinArg;

  const listings = await prisma.listing.findMany({
    where: {
      url: { not: null },
      vehicleId: { not: null },
      status: "ACTIVE",
      priceStatus: { not: "PRICE_INVALID" },
      OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
      vehicle: {
        is: vehicleFilter,
      },
    },
    select: {
      id: true,
      url: true,
      imageUrl: true,
      price: true,
      askingPrice: true,
      year: true,
      vehicleId: true,
      vehicle: {
        select: {
          vin: true,
          _count: {
            select: {
              images: true,
            },
          },
        },
      },
      model: {
        select: {
          name: true,
          make: {
            select: { name: true },
          },
        },
      },
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  let updated = 0;
  let listingsWithImagesUpdated = 0;
  let vehicleImagesAdded = 0;
  let pricesUpdated = 0;
  let staleListingsDeactivated = 0;
  let skipped = 0;

  for (const listing of listings) {
    if (!listing.url || !listing.vehicleId) continue;
    if (isKnownInactiveListingUrl(listing.url) || isKnownInactiveListingUrl(listing.imageUrl)) {
      await deactivateStaleListingMedia(listing.id, listing.vehicleId);
      staleListingsDeactivated++;
      console.log(`STALE ${listing.model.make.name} ${listing.model.name} | sold/archive media | ${listing.url}`);
      continue;
    }
    if (!includeExistingGallery && (listing.vehicle?._count.images || 0) >= maxImages) {
      skipped++;
      continue;
    }

    const html = await fetchHtml(listing.url);
    if (!html) {
      skipped++;
      continue;
    }

    const vin = listing.vehicle?.vin || null;
    const pageVins = extractVins(html);
    const pageContainsDifferentVin = Boolean(vin && pageVins.length > 0 && !pageVins.includes(vin));
    const isSingleVehiclePage = Boolean(
      vin &&
        pageVins.includes(vin) &&
        (pageVins.length === 1 || isVehicleDetailUrl(listing.url))
    );

    if (pageContainsDifferentVin) {
      skipped++;
      console.log(`SKIP ${listing.model.make.name} ${listing.model.name} | source VIN mismatch | ${listing.url}`);
      continue;
    }

    const pageImages = pickBestImages(html, listing.url, [
      String(listing.year),
      listing.model.make.name,
      listing.model.name,
      vin || "",
    ], vin, isSingleVehiclePage, maxImages * 3) ?? [];
    const imageValidation = await validateCandidateImages(pageImages, maxImages);
    const invalidExistingHero = validateExistingImages && listing.imageUrl
      ? await isInvalidImageContent(listing.imageUrl)
      : false;
    const validImages = imageValidation.validImages;
    const rejectedImages = [...imageValidation.rejectedImages];
    if (invalidExistingHero && listing.imageUrl) rejectedImages.push(listing.imageUrl);
    await markRejectedVehicleImages(listing.vehicleId, rejectedImages);

    const imageUrl = validImages[0] || null;

    const livePrice = updatePrices ? pickBestPrice(html, vin, isSingleVehiclePage) : null;
    const data: { imageUrl?: string; price?: number; askingPrice?: number; priceStatus?: string } = {};

    if (imageUrl && (updateExistingImages || invalidExistingHero || !listing.imageUrl) && imageUrl !== listing.imageUrl) {
      data.imageUrl = imageUrl;
    }

    if (livePrice && livePrice !== (listing.askingPrice ?? listing.price)) {
      data.price = livePrice;
      data.askingPrice = livePrice;
      data.priceStatus = "VALID_PRICE";
    }

    const addedImages = await attachPageVehicleImages({
      vehicleId: listing.vehicleId,
      images: validImages,
      alt: `${listing.year} ${listing.model.make.name} ${listing.model.name}`,
      primaryUrl: data.imageUrl,
    });

    if (Object.keys(data).length === 0 && addedImages === 0) {
      skipped++;
      continue;
    }

    if (Object.keys(data).length > 0) {
      await prisma.listing.update({
        where: { id: listing.id },
        data,
      });
    }

    if (data.imageUrl || addedImages > 0) listingsWithImagesUpdated++;
    vehicleImagesAdded += addedImages;
    if (data.price) pricesUpdated++;
    updated++;
    console.log(
      `PAGE ${listing.model.make.name} ${listing.model.name} | ${data.price ? `$${data.price.toLocaleString()}` : "price unchanged"} | ${data.imageUrl || "hero unchanged"} | +${addedImages} gallery image${addedImages === 1 ? "" : "s"} | ${rejectedImages.length} rejected`,
    );
  }

  console.log(JSON.stringify({ targetMakes, inspected: listings.length, updated, listingsWithImagesUpdated, vehicleImagesAdded, pricesUpdated, staleListingsDeactivated, skipped }, null, 2));
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) return null;
    return response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function pickBestImages(html: string, pageUrl: string, hints: string[], vin: string | null, isSingleVehiclePage: boolean, limit: number) {
  const candidates = [
    ...extractMetaImages(html, pageUrl),
    ...extractImageUrls(html, pageUrl),
    ...extractJsonLikeImageUrls(html, pageUrl),
  ];
  const unique = Array.from(new Set(candidates.filter(isUsefulVehicleImageUrl)))
    .filter((url) => !hasDifferentVin(url, vin));
  if (unique.length === 0) return null;

  if (vin) {
    const vinImages = unique.filter((url) => extractVins(url).includes(vin));
    if (vinImages.length > 0) return rankImages(vinImages, hints).slice(0, limit);
  }

  if (!isSingleVehiclePage) return null;

  return rankImages(unique, hints).slice(0, limit);
}

async function attachPageVehicleImages({
  vehicleId,
  images,
  alt,
  primaryUrl,
}: {
  vehicleId: string;
  images: string[] | null;
  alt: string;
  primaryUrl?: string;
}) {
  if (!images || images.length === 0) return 0;

  const existing = await prisma.vehicleImage.findMany({
    where: { vehicleId },
    select: { id: true, url: true, isPrimary: true },
  });
  const existingUrls = new Set(existing.map((image) => image.url));
  let hasPrimary = existing.some((image) => image.isPrimary);
  let added = 0;

  for (const url of images) {
    if (existingUrls.has(url)) continue;

    await prisma.vehicleImage.create({
      data: {
        vehicleId,
        url,
        alt,
        isPrimary: primaryUrl ? url === primaryUrl : !hasPrimary,
        validationStatus: "VALID",
      },
    });

    existingUrls.add(url);
    hasPrimary = true;
    added++;
  }

  if (primaryUrl) {
    await prisma.vehicleImage.updateMany({
      where: { vehicleId, url: primaryUrl, validationStatus: "VALID" },
      data: { isPrimary: true },
    });
    await prisma.vehicleImage.updateMany({
      where: { vehicleId, url: { not: primaryUrl } },
      data: { isPrimary: false },
    });
  }

  return added;
}

async function validateCandidateImages(images: string[], limit: number) {
  const validImages: string[] = [];
  const rejectedImages: string[] = [];

  for (const image of images) {
    const validation = await validateVehicleImageContentFromUrl(image);
    if (validation.status === "VALID_CAR_IMAGE") {
      validImages.push(image);
      if (validImages.length >= limit) break;
      continue;
    }

    rejectedImages.push(image);
    console.log(
      `REJECT image | ${validation.status} | ${validation.reason} | ${image}`
    );
  }

  return { validImages, rejectedImages };
}

async function isInvalidImageContent(imageUrl: string) {
  const validation = await validateVehicleImageContentFromUrl(imageUrl);
  if (validation.status === "VALID_CAR_IMAGE") return false;

  console.log(`REJECT current hero | ${validation.status} | ${validation.reason} | ${imageUrl}`);
  return true;
}

async function markRejectedVehicleImages(vehicleId: string, imageUrls: string[]) {
  const uniqueUrls = Array.from(new Set(imageUrls.filter(Boolean)));
  if (uniqueUrls.length === 0) return;

  await prisma.vehicleImage.updateMany({
    where: {
      vehicleId,
      url: { in: uniqueUrls },
    },
    data: {
      isPrimary: false,
      validationStatus: "IMAGE_UNVERIFIED",
    },
  });
}

async function deactivateStaleListingMedia(listingId: string, vehicleId: string) {
  await prisma.listing.update({
    where: { id: listingId },
    data: {
      status: "INACTIVE",
      freshnessStatus: "INACTIVE",
      validationStatus: "STALE_SOURCE",
    },
  });

  await prisma.vehicleImage.updateMany({
    where: {
      vehicleId,
      OR: [
        { url: { contains: "/sold-images" } },
        { url: { contains: "/pre-owned-inventory-sold" } },
        { url: { contains: "/used-inventory-sold" } },
        { url: { contains: "/inventory-sold" } },
        { url: { contains: "/sold-inventory" } },
      ],
    },
    data: {
      isPrimary: false,
      validationStatus: "IMAGE_UNVERIFIED",
    },
  });
}

function rankImages(images: string[], hints: string[]) {
  const normalizedHints = hints.map(normalize).filter(Boolean);
  return [...images].sort((a, b) => scoreImage(b, normalizedHints) - scoreImage(a, normalizedHints));
}

function scoreImage(url: string, normalizedHints: string[]) {
  const normalizedUrl = normalize(url);
  let score = 0;
  if (normalizedHints.some((hint) => normalizedUrl.includes(hint))) score += 30;
  if (/\/(?:new|used|certified)\//i.test(url)) score += 16;
  if (/vehicle|inventory|photos?|gallery|large|xl|original|dealerinspire|cloudfront|images/i.test(url)) score += 12;
  if (/\b(?:thumb|thumbnail|small|tiny|icon|logo)\b/i.test(url)) score -= 20;
  const width = Number(url.match(/(?:width|w)[=/_-]?([0-9]{3,4})/i)?.[1] || 0);
  if (width >= 900) score += 10;
  if (width > 0 && width < 350) score -= 10;
  return score;
}

function extractMetaImages(html: string, pageUrl: string) {
  const images = new Set<string>();
  for (const match of html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image|image)["'][^>]*>/gi)) {
    const content = match[0].match(/\bcontent=["']([^"']+)["']/i)?.[1];
    const absolute = absolutize(decodeHtml(content ?? ""), pageUrl);
    if (absolute) images.add(absolute);
  }
  return Array.from(images);
}

function pickBestPrice(html: string, vin: string | null, isSingleVehiclePage: boolean) {
  const structuredPrices = extractStructuredPrices(html, vin, isSingleVehiclePage);
  const structured = structuredPrices.find(isValidVehiclePrice);
  if (structured) return structured;

  if (!isSingleVehiclePage && !vin) return null;
  const context = vin ? htmlAroundVin(html, vin) : html;
  const priceFromContext = inferPriceFromText(decodeHtml(stripTags(context)));
  if (priceFromContext) return priceFromContext;

  return isSingleVehiclePage ? inferPriceFromText(decodeHtml(stripTags(html))) : null;
}

function extractStructuredPrices(html: string, vin: string | null, isSingleVehiclePage: boolean) {
  const prices: number[] = [];

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]));
      for (const node of findObjects(parsed)) {
        const record = node as Record<string, unknown>;
        const serialized = JSON.stringify(record).toUpperCase();
        if (!isSingleVehiclePage && vin && !serialized.includes(vin.toUpperCase())) continue;
        const offers = asRecord(record.offers);
        const price = pickNumber(offers || record, ["price", "lowPrice", "highPrice"]);
        if (price) prices.push(price);
      }
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }

  if (isSingleVehiclePage) {
    for (const match of html.matchAll(/<meta\b[^>]*(?:property|name|itemprop)=["'](?:product:price:amount|price|priceCurrency|og:price:amount)["'][^>]*>/gi)) {
      const content = match[0].match(/\bcontent=["']([^"']+)["']/i)?.[1];
      const price = parsePrice(content || "");
      if (price) prices.push(price);
    }

    for (const match of html.matchAll(/\b(?:data-price|price|internetPrice|askingPrice)["']?\s*[:=]\s*["']?\$?\s*([0-9][0-9,.]{3,})/gi)) {
      const price = parsePrice(match[1]);
      if (price) prices.push(price);
    }
  }

  return prices;
}

function findObjects(value: unknown, output: unknown[] = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) findObjects(item, output);
    return output;
  }

  output.push(value);
  for (const nested of Object.values(value)) {
    findObjects(nested, output);
  }
  return output;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function pickNumber(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    const price = typeof value === "number" ? value : parsePrice(String(value ?? ""));
    if (price) return price;
  }
  return null;
}

function extractImageUrls(html: string, pageUrl: string) {
  const images = new Set<string>();
  for (const match of html.matchAll(/(?:src|data-src|srcset|data-srcset)=["']([^"']+)["']/gi)) {
    const candidates = match[1].split(",").map((part) => part.trim().split(/\s+/)[0]);
    for (const candidate of candidates) {
      const absolute = absolutize(decodeHtml(candidate), pageUrl);
      if (absolute) images.add(absolute);
    }
  }
  return Array.from(images);
}

function extractJsonLikeImageUrls(html: string, pageUrl: string) {
  const images = new Set<string>();
  const normalizedHtml = html.replace(/\\\//g, "/").replace(/\\u002F/g, "/");

  for (const match of normalizedHtml.matchAll(/https?:\/\/[^"' <>)]+?\.(?:jpe?g|png|webp)(?:\?[^"' <>)]+)?/gi)) {
    const absolute = absolutize(decodeHtml(match[0]), pageUrl);
    if (absolute) images.add(absolute);
  }

  for (const match of normalizedHtml.matchAll(/["'](?:image|imageUrl|photo|photoUrl|src|url)["']\s*:\s*["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)) {
    const absolute = absolutize(decodeHtml(match[1]), pageUrl);
    if (absolute) images.add(absolute);
  }

  return Array.from(images);
}

function absolutize(value: string, pageUrl: string) {
  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return null;
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isUsefulVehicleImageUrl(value: string) {
  if (!/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(value)) return false;
  return !/placeholder|logo|icon|favicon|spinner|loading|avatar|profile|badge|sprite|transparent|blank|noimage|comingsoon|autocheck|carfax|e6-static-thumber/i.test(value);
}

function extractVins(value: string | null | undefined) {
  return Array.from(new Set((value?.toUpperCase().match(VIN_RE) || [])));
}

function hasDifferentVin(value: string, vin: string | null) {
  if (!vin) return false;
  const vins = extractVins(value);
  return vins.length > 0 && !vins.includes(vin);
}

function isVehicleDetailUrl(value: string) {
  return /\/(?:new|used|certified|pre-owned|inventory)\/[^?#]+/i.test(value);
}

function htmlAroundVin(html: string, vin: string) {
  const index = html.toUpperCase().indexOf(vin.toUpperCase());
  if (index < 0) return html;
  return html.slice(Math.max(0, index - 8000), index + 8000);
}

function stripTags(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function inferPriceFromText(text: string) {
  const matches = Array.from(text.matchAll(/\$\s?([0-9][0-9,.]{3,})/g))
    .map((match) => parsePrice(match[1]))
    .filter((price): price is number => Boolean(price && isValidVehiclePrice(price)));
  return matches[0] ?? null;
}

function parsePrice(value: string | number | null | undefined) {
  if (typeof value === "number") return Math.round(value);
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function isValidVehiclePrice(value: number) {
  return value >= 10000 && value <= 20000000;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

main()
  .catch((error) => {
    console.error("Listing page image backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
