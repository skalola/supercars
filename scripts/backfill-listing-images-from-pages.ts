import { prisma } from "@/lib/prisma";
import { normalizeSupportedMake, SUPPORTED_MAKES } from "@/lib/supported-makes";

const makeArg = process.argv.find((arg) => arg.startsWith("--make="))?.split("=")[1];
const limitArg = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 100);
const targetMakes = makeArg
  ? [normalizeSupportedMake(makeArg)].filter((make): make is (typeof SUPPORTED_MAKES)[number] => Boolean(make))
  : [...SUPPORTED_MAKES];
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 100;

const HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
};

async function main() {
  if (targetMakes.length === 0) throw new Error(`Unsupported make: ${makeArg}`);

  const listings = await prisma.listing.findMany({
    where: {
      imageUrl: null,
      url: { not: null },
      vehicleId: { not: null },
      status: "ACTIVE",
      validationStatus: "VALID",
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
      year: true,
      vehicleId: true,
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
  let skipped = 0;

  for (const listing of listings) {
    if (!listing.url || !listing.vehicleId) continue;
    const html = await fetchHtml(listing.url);
    if (!html) {
      skipped++;
      continue;
    }

    const imageUrl = pickBestImage(html, listing.url, [
      String(listing.year),
      listing.model.make.name,
      listing.model.name,
    ]);
    if (!imageUrl) {
      skipped++;
      continue;
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: { imageUrl },
    });

    const existingImage = await prisma.vehicleImage.findFirst({
      where: {
        vehicleId: listing.vehicleId,
        url: imageUrl,
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
          url: imageUrl,
          alt: `${listing.year} ${listing.model.make.name} ${listing.model.name}`,
          isPrimary: existingPrimary === 0,
          validationStatus: "VALID",
        },
      });
    }

    updated++;
    console.log(`IMG ${listing.model.make.name} ${listing.model.name} | ${imageUrl}`);
  }

  console.log(JSON.stringify({ targetMakes, inspected: listings.length, updated, skipped }, null, 2));
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
