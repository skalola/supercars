import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { normalizeMakeSlug } from "@/lib/makes/make-metadata";

const prisma = new PrismaClient();
const publicDir = path.join(process.cwd(), "public");
const brandFallbackDir = path.join(publicDir, "images", "brand-fallbacks");

type CliOptions = {
  dryRun: boolean;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const models = await prisma.model.findMany({
    select: {
      id: true,
      name: true,
      make: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
        },
      },
      images: {
        select: {
          type: true,
          reviewStatus: true,
        },
      },
    },
    orderBy: [
      { make: { name: "asc" } },
      { name: "asc" },
    ],
  });

  const missingModels = models.filter((model) => !hasDisplayableImage(model.images));
  const makes = new Map(missingModels.map((model) => [model.make.id, model.make]));

  if (!options.dryRun) {
    await mkdir(brandFallbackDir, { recursive: true });
    for (const make of makes.values()) {
      const svg = renderBrandHeroSvg(make.name);
      await writeFile(path.join(brandFallbackDir, `${getAssetSlug(make.slug)}.svg`), svg, "utf8");
    }
  }

  let created = 0;
  let updated = 0;

  for (const model of missingModels) {
    const url = `/images/brand-fallbacks/${getAssetSlug(model.make.slug)}.svg`;
    if (options.dryRun) {
      console.log(`[brand-hero:dry-run] ${model.make.name} ${model.name} -> ${url}`);
      continue;
    }

    const existing = await prisma.modelImage.findUnique({
      where: {
        modelId_url: {
          modelId: model.id,
          url,
        },
      },
    });

    await prisma.modelImage.upsert({
      where: {
        modelId_url: {
          modelId: model.id,
          url,
        },
      },
      update: {
        type: "hero",
        source: "BRAND_IMAGE_FALLBACK",
        sourceName: "Brand fallback image",
        sourceUrl: model.make.logoUrl,
        license: "Generated SUPERCAR DASH brand fallback; not a model photo",
        attribution: model.make.name,
        attributionUrl: model.make.logoUrl,
        confidence: 1,
        reviewStatus: "APPROVED",
      },
      create: {
        modelId: model.id,
        url,
        type: "hero",
        source: "BRAND_IMAGE_FALLBACK",
        sourceName: "Brand fallback image",
        sourceUrl: model.make.logoUrl,
        license: "Generated SUPERCAR DASH brand fallback; not a model photo",
        attribution: model.make.name,
        attributionUrl: model.make.logoUrl,
        confidence: 1,
        reviewStatus: "APPROVED",
      },
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  console.log(`[brand-hero] Missing models scanned: ${missingModels.length}`);
  console.log(`[brand-hero] Brand hero assets generated: ${makes.size}`);
  console.log(`[brand-hero] Model images created: ${created}`);
  console.log(`[brand-hero] Model images updated: ${updated}`);
}

function hasDisplayableImage(images: Array<{ type: string | null; reviewStatus: string | null }>) {
  return images.some((image) => image.type?.toLowerCase() !== "candidate" && image.reviewStatus !== "NEEDS_REVIEW");
}

function renderBrandHeroSvg(makeName: string) {
  const label = escapeXml(makeName.toUpperCase());
  const initials = escapeXml(
    makeName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => part[0])
      .join("")
      .toUpperCase(),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="${label} brand image">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="#2a2d34"/>
      <stop offset="58%" stop-color="#101216"/>
      <stop offset="100%" stop-color="#050608"/>
    </radialGradient>
    <linearGradient id="redline" x1="0%" x2="100%" y1="0%" y2="0%">
      <stop offset="0%" stop-color="#6d0609" stop-opacity="0"/>
      <stop offset="48%" stop-color="#e50914"/>
      <stop offset="100%" stop-color="#6d0609" stop-opacity="0"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect width="1600" height="900" fill="url(#glow)"/>
  <path d="M130 705 C360 650 520 744 750 684 C1000 618 1165 642 1470 568" fill="none" stroke="#ffffff" stroke-opacity="0.09" stroke-width="2"/>
  <path d="M110 736 C360 682 530 782 770 716 C1032 642 1200 675 1490 594" fill="none" stroke="#e50914" stroke-opacity="0.38" stroke-width="3"/>
  <rect x="150" y="170" width="1300" height="560" rx="30" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.10"/>
  <circle cx="800" cy="405" r="150" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.13"/>
  <text x="800" y="448" text-anchor="middle" fill="#ffffff" fill-opacity="0.92" font-family="Arial, Helvetica, sans-serif" font-size="128" font-weight="700" letter-spacing="18" filter="url(#softShadow)">${initials}</text>
  <rect x="475" y="570" width="650" height="3" fill="url(#redline)"/>
  <text x="800" y="642" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700" letter-spacing="10">${label}</text>
  <text x="800" y="690" text-anchor="middle" fill="#e50914" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="8">BRAND IMAGE</text>
</svg>
`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getAssetSlug(slug: string) {
  return normalizeMakeSlug(slug);
}

function parseOptions(args: string[]): CliOptions {
  return {
    dryRun: args.includes("--dry-run"),
  };
}

main()
  .catch((error) => {
    console.error("[brand-hero] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
