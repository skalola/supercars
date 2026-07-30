import { prisma } from "@/lib/prisma";
import { normalizeSupportedMake, SUPPORTED_MAKES } from "@/lib/supported-makes";

const makeArg = process.argv.find((arg) => arg.startsWith("--make="))?.split("=")[1];
const limitArg = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 100);
const deactivateUnresolved = process.argv.includes("--deactivate-unresolved");
const targetMakes = makeArg
  ? [normalizeSupportedMake(makeArg)].filter((make): make is (typeof SUPPORTED_MAKES)[number] => Boolean(make))
  : [...SUPPORTED_MAKES];
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 100;

const HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

type HtmlPage = { url: string; html: string; imageUrl?: string | null };

const htmlCache = new Map<string, Promise<HtmlPage | null>>();
const detailLinksCache = new Map<string, Promise<string[]>>();

async function main() {
  if (targetMakes.length === 0) throw new Error(`Unsupported make: ${makeArg}`);

  const listings = await prisma.listing.findMany({
    where: {
      url: { not: null },
      vehicle: {
        is: {
          vin: { not: "" },
          model: {
            make: {
              name: { in: targetMakes },
            },
          },
        },
      },
      OR: [
        { url: { contains: "/inventory", mode: "insensitive" } },
        { url: { contains: "/used-inventory", mode: "insensitive" } },
        { url: { contains: "/all-inventory", mode: "insensitive" } },
        { url: { contains: "/searchused", mode: "insensitive" } },
        { url: { contains: "cars-for-sale", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      url: true,
      imageUrl: true,
      sourceId: true,
      externalListingId: true,
      vehicle: {
        select: {
          id: true,
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
      year: true,
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  let repaired = 0;
  let deactivated = 0;
  let skipped = 0;

  for (const listing of listings) {
    if (!listing.url || !listing.vehicle?.vin) continue;
    if (isLikelyVehicleDetailUrl(listing.url)) {
      skipped++;
      continue;
    }

    const match = await findDetailPageForVin(listing.url, listing.vehicle.vin);
    if (!match) {
      skipped++;
      if (deactivateUnresolved) {
        await prisma.listing.update({
          where: { id: listing.id },
          data: {
            status: "INACTIVE",
            freshnessStatus: "INACTIVE",
            imageUrl: null,
          },
        });
        deactivated++;
      }
      continue;
    }

    const imageUrl = match.imageUrl ?? pickBestImage(match.html, match.url, [
      listing.vehicle.vin,
      String(listing.year),
      listing.model.make.name,
      listing.model.name,
    ]);

    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        url: match.url,
        imageUrl,
        externalListingId: listing.externalListingId || idFromUrl(match.url) || `${listing.vehicle.vin}:${match.url}`,
        status: "ACTIVE",
        freshnessStatus: "ACTIVE",
        lastSeen: new Date(),
      },
    });

    if (imageUrl) {
      const existingImage = await prisma.vehicleImage.findFirst({
        where: {
          vehicleId: listing.vehicle.id,
          url: imageUrl,
        },
        select: { id: true },
      });

      if (!existingImage) {
        const existingPrimary = await prisma.vehicleImage.count({
          where: { vehicleId: listing.vehicle.id, isPrimary: true },
        });
        await prisma.vehicleImage.create({
          data: {
            vehicleId: listing.vehicle.id,
            url: imageUrl,
            alt: `${listing.year} ${listing.model.make.name} ${listing.model.name}`,
            isPrimary: existingPrimary === 0,
            validationStatus: "VALID",
          },
        });
      }
    }

    repaired++;
    console.log(`FIX ${listing.vehicle.vin} | ${match.url} | ${imageUrl || "no image"}`);
  }

  console.log(JSON.stringify({ targetMakes, inspected: listings.length, repaired, deactivated, skipped }, null, 2));
}

async function findDetailPageForVin(sourceUrl: string, vin: string): Promise<HtmlPage | null> {
  const sourcePage = await fetchHtml(sourceUrl);
  if (!sourcePage) return null;

  if (isLikelyVehicleDetailUrl(sourcePage.url) && hasVin(sourcePage.html, vin)) {
    return sourcePage;
  }

  const structuredListing = findStructuredVehicleListing(sourcePage.html, sourcePage.url, vin);
  if (structuredListing?.url) {
    const detailPage = await fetchHtml(structuredListing.url);
    if (detailPage && hasVin(detailPage.html, vin)) {
      return { ...detailPage, imageUrl: structuredListing.imageUrl ?? detailPage.imageUrl };
    }
  }

  const detailLinks = await getDetailLinks(sourcePage.url, sourcePage.html);
  for (const detailUrl of detailLinks) {
    const detailPage = await fetchHtml(detailUrl);
    if (detailPage && hasVin(detailPage.html, vin)) return detailPage;
  }

  return null;
}

async function getDetailLinks(pageUrl: string, html: string) {
  const cached = detailLinksCache.get(pageUrl);
  if (cached) return cached;

  const promise = Promise.resolve(
    Array.from(
      new Set(
        Array.from(html.matchAll(/href=["']([^"']+)["']/gi))
          .map((match) => absolutize(decodeHtml(match[1]), pageUrl))
          .filter((url): url is string => Boolean(url && isLikelyVehicleDetailUrl(url))),
      ),
    ).slice(0, 180),
  );
  detailLinksCache.set(pageUrl, promise);
  return promise;
}

async function fetchHtml(url: string): Promise<HtmlPage | null> {
  const cached = htmlCache.get(url);
  if (cached) return cached;

  const promise = fetchHtmlUncached(url);
  htmlCache.set(url, promise);
  return promise;
}

async function fetchHtmlUncached(url: string): Promise<HtmlPage | null> {
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
    return {
      url: response.url || url,
      html: await response.text(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function hasVin(html: string, vin: string) {
  return html.toUpperCase().includes(vin.toUpperCase());
}

function pickBestImage(html: string, pageUrl: string, hints: string[]) {
  const candidates = [
    ...extractMetaImages(html, pageUrl),
    ...extractImageUrls(html, pageUrl),
  ];
  const unique = Array.from(new Set(candidates.filter(isUsefulVehicleImageUrl)));
  if (unique.length === 0) return null;

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

function extractImageUrls(html: string, pageUrl: string) {
  const images = new Set<string>();
  for (const match of html.matchAll(/(?:src|data-src|data-zoom-image|srcset|data-srcset)=["']([^"']+)["']/gi)) {
    const candidates = match[1].split(",").map((part) => part.trim().split(/\s+/)[0]);
    for (const candidate of candidates) {
      const absolute = absolutize(decodeHtml(candidate), pageUrl);
      if (absolute) images.add(absolute);
    }
  }
  return Array.from(images);
}

function findStructuredVehicleListing(html: string, pageUrl: string, vin: string) {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const text = decodeHtml(match[1].replace(/<[^>]*>/g, " ")).trim();
    const parsed = parseJson(text);
    if (!parsed) continue;

    for (const node of flattenJsonLd(parsed)) {
      const searchable = JSON.stringify(node);
      if (!hasVin(searchable, vin)) continue;
      const offers = asRecord(node.offers);
      const url = absolutize(pickString(node, ["url", "@id"]) ?? pickString(offers, ["url"]) ?? "", pageUrl);
      if (!isLikelyVehicleDetailUrl(url)) continue;

      const imageUrl = pickImages(node)
        .map((image) => absolutize(image, pageUrl))
        .find((image): image is string => Boolean(image && isUsefulVehicleImageUrl(image))) ?? null;

      return { url, imageUrl };
    }
  }

  return null;
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  const record = asRecord(value);
  if (!record) return [];

  const about = asRecord(record.about);
  const offers = asRecord(record.offers);
  const aboutOffers = asRecord(about?.offers);
  const item = asRecord(record.item);

  return [
    record,
    ...flattenJsonLd(record["@graph"]),
    ...flattenJsonLd(record.itemListElement),
    ...flattenJsonLd(record.itemOffered),
    ...flattenJsonLd(offers?.itemOffered),
    ...flattenJsonLd(about),
    ...flattenJsonLd(aboutOffers),
    ...flattenJsonLd(aboutOffers?.itemOffered),
    ...flattenJsonLd(item?.item),
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function pickString(record: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return decodeHtml(value.trim());
    if (typeof value === "number") return String(value);
    const nested = asRecord(value);
    if (nested) {
      const nestedValue = pickString(nested, ["name", "value", "@id"]);
      if (nestedValue) return nestedValue;
    }
  }
  return null;
}

function pickImages(record: Record<string, unknown>) {
  const value = record.image;
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function isUsefulVehicleImageUrl(value: string) {
  if (!/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(value)) return false;
  if (/placeholder|logo|icon|favicon|spinner|loading|avatar|profile|badge|sprite|transparent|blank/i.test(value)) return false;
  if (/(?:[?&]|\/)(?:h|height)=?(?:60|80|100)(?:&|$)/i.test(value)) return false;
  return true;
}

function isLikelyVehicleDetailUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/\/cars-for-sale\/vehicle\/\d+/i.test(path)) return true;
    if (/\/vehicledetail\//i.test(path)) return true;
    if (/\/car\/(?:ferrari|lamborghini|mclaren)\//i.test(path)) return true;
    if (/\/(?:new|used|certified|pre-owned)\/(?:ferrari|lamborghini|mclaren)\//i.test(path)) return true;
    if (/(?:ferrari|lamborghini|mclaren).+for-sale.+\.(?:htm|html)$/i.test(path)) return true;
    if (/\/vehicle-details\/.+/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function idFromUrl(url: string) {
  return url.match(/-([a-f0-9]{32})\.htm/i)?.[1] ?? null;
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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

main()
  .catch((error) => {
    console.error("Listing detail URL repair failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
