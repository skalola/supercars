import { prisma } from "@/lib/prisma";
import { normalizeSupportedMake, SUPPORTED_MAKES } from "@/lib/supported-makes";

const makeArg = process.argv.find((arg) => arg.startsWith("--make="))?.split("=")[1];
const limitArg = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 100);
const updateExistingImages = process.argv.includes("--update-existing-images");
const updatePrices = process.argv.includes("--update-prices");
const targetMakes = makeArg
  ? [normalizeSupportedMake(makeArg)].filter((make): make is (typeof SUPPORTED_MAKES)[number] => Boolean(make))
  : [...SUPPORTED_MAKES];
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 100;

const HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

async function main() {
  if (targetMakes.length === 0) throw new Error(`Unsupported make: ${makeArg}`);

  const listings = await prisma.listing.findMany({
    where: {
      url: { not: null },
      vehicleId: { not: null },
      status: "ACTIVE",
      priceStatus: { not: "PRICE_INVALID" },
      OR: [{ askingPrice: { gte: 10000 } }, { price: { gte: 10000 } }],
      vehicle: {
        is: {
          inventoryStatus: { in: ["ACTIVE", "VALID", "WARNING"] },
          model: {
            make: {
              name: { in: targetMakes },
            },
          },
        },
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
  let imagesUpdated = 0;
  let pricesUpdated = 0;
  let skipped = 0;

  for (const listing of listings) {
    if (!listing.url || !listing.vehicleId) continue;
    const html = await fetchHtml(listing.url);
    if (!html) {
      skipped++;
      continue;
    }

    const vin = listing.vehicle?.vin || null;
    const pageVins = extractVins(html);
    const pageContainsDifferentVin = Boolean(vin && pageVins.length > 0 && !pageVins.includes(vin));
    const isSingleVehiclePage = Boolean(vin && pageVins.length === 1 && pageVins[0] === vin);

    if (pageContainsDifferentVin) {
      skipped++;
      console.log(`SKIP ${listing.model.make.name} ${listing.model.name} | source VIN mismatch | ${listing.url}`);
      continue;
    }

    const imageUrl = pickBestImage(html, listing.url, [
      String(listing.year),
      listing.model.make.name,
      listing.model.name,
      vin || "",
    ], vin, isSingleVehiclePage);

    const livePrice = updatePrices ? pickBestPrice(html, vin, isSingleVehiclePage) : null;
    const data: { imageUrl?: string; price?: number; askingPrice?: number; priceStatus?: string } = {};

    if (imageUrl && (updateExistingImages || !listing.imageUrl) && imageUrl !== listing.imageUrl) {
      data.imageUrl = imageUrl;
    }

    if (livePrice && livePrice !== (listing.askingPrice ?? listing.price)) {
      data.price = livePrice;
      data.askingPrice = livePrice;
      data.priceStatus = "VALID_PRICE";
    }

    if (Object.keys(data).length === 0) {
      skipped++;
      continue;
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data,
    });

    if (data.imageUrl) {
      const existingImage = await prisma.vehicleImage.findFirst({
        where: {
          vehicleId: listing.vehicleId,
          url: data.imageUrl,
        },
        select: { id: true },
      });

      if (!existingImage) {
        const existingPrimary = await prisma.vehicleImage.count({
          where: { vehicleId: listing.vehicleId, isPrimary: true },
        });
        await prisma.vehicleImage.create({
          data: {
            vehicleId: listing.vehicleId,
            url: data.imageUrl,
            alt: `${listing.year} ${listing.model.make.name} ${listing.model.name}`,
            isPrimary: existingPrimary === 0,
            validationStatus: "VALID",
          },
        });
      }

      imagesUpdated++;
    }

    if (data.price) pricesUpdated++;
    updated++;
    console.log(
      `PAGE ${listing.model.make.name} ${listing.model.name} | ${data.price ? `$${data.price.toLocaleString()}` : "price unchanged"} | ${data.imageUrl || "image unchanged"}`,
    );
  }

  console.log(JSON.stringify({ targetMakes, inspected: listings.length, updated, imagesUpdated, pricesUpdated, skipped }, null, 2));
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

function pickBestImage(html: string, pageUrl: string, hints: string[], vin: string | null, isSingleVehiclePage: boolean) {
  const candidates = [
    ...extractMetaImages(html, pageUrl),
    ...extractImageUrls(html, pageUrl),
  ];
  const unique = Array.from(new Set(candidates.filter(isUsefulVehicleImageUrl)))
    .filter((url) => !hasDifferentVin(url, vin));
  if (unique.length === 0) return null;

  if (vin) {
    const vinImage = unique.find((url) => extractVins(url).includes(vin));
    if (vinImage) return vinImage;
  }

  if (!isSingleVehiclePage) return null;

  const normalizedHints = hints.map(normalize).filter(Boolean);
  return (
    unique.find((url) => {
      const normalizedUrl = normalize(url);
      return normalizedHints.some((hint) => normalizedUrl.includes(hint));
    }) ?? unique[0]
  );
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
  return !/placeholder|logo|icon|favicon|spinner|loading|avatar|profile|badge|sprite|transparent|blank/i.test(value);
}

function extractVins(value: string | null | undefined) {
  return Array.from(new Set((value?.toUpperCase().match(VIN_RE) || [])));
}

function hasDifferentVin(value: string, vin: string | null) {
  if (!vin) return false;
  const vins = extractVins(value);
  return vins.length > 0 && !vins.includes(vin);
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
