import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import {
  fetchPartSourcePageMetadata,
  isLowConfidencePartImageUrl,
} from "@/lib/parts/source-page-enrichment";

const prisma = new PrismaClient();

type EnrichmentArgs = {
  limit: number;
  dryRun: boolean;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const parts = await prisma.performancePart.findMany({
    where: {
      status: { in: ["ACTIVE", "MANUAL_REVIEW"] },
      sourceUrl: { not: null },
    },
    include: {
      brand: true,
      category: true,
    },
    orderBy: [
      { imageUrl: "asc" },
      { updatedAt: "asc" },
    ],
    take: args.limit,
  });

  let checked = 0;
  let updated = 0;
  let skipped = 0;
  const review: string[] = [];

  for (const part of parts) {
    checked += 1;
    if (!part.sourceUrl) continue;

    try {
      const metadata = await fetchPartSourcePageMetadata(part.sourceUrl);
      if (!metadata) {
        skipped += 1;
        review.push(`${part.brand.name} | ${part.name} | source unavailable`);
        continue;
      }

      const nextImageUrl = await shouldUpdateImage(part.imageUrl, metadata.imageUrl, part.name) ? metadata.imageUrl : null;
      const nextDescription =
        !part.description && metadata.description ? safeDescription(metadata.description) : null;

      if (!nextImageUrl && !nextDescription) {
        skipped += 1;
        continue;
      }

      if (args.dryRun) {
        updated += 1;
        console.log(`DRY ${part.brand.name} | ${part.name}`);
        if (nextImageUrl) console.log(`  image: ${nextImageUrl}`);
        if (nextDescription) console.log(`  description: ${nextDescription}`);
        continue;
      }

      await prisma.performancePart.update({
        where: { id: part.id },
        data: {
          imageUrl: nextImageUrl || undefined,
          description: nextDescription || undefined,
          sourceConfidence: nextImageUrl || nextDescription ? "SOURCE_VERIFIED" : part.sourceConfidence,
          lastCheckedAt: new Date(),
          notes: mergeNotes(part.notes, metadata.imageSource ? `Image enriched from ${metadata.imageSource}.` : null),
        },
      });

      updated += 1;
      console.log(`UPD ${part.brand.name} | ${part.name}`);
    } catch (error) {
      skipped += 1;
      review.push(`${part.brand.name} | ${part.name} | ${error instanceof Error ? error.message : "enrichment error"}`);
    }
  }

  console.log("");
  console.log("Performance part enrichment complete");
  console.log(`  Checked: ${checked}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  if (review.length > 0) {
    console.log("  Manual review:");
    for (const item of review.slice(0, 20)) console.log(`    - ${item}`);
  }
}

async function shouldUpdateImage(current: string | null, candidate: string | null, partName: string) {
  if (!candidate || isLowConfidencePartImageUrl(candidate)) return false;
  if (hasConflictingVehicleToken(candidate, partName)) return false;
  if (!(await hasUsableImageDimensions(candidate))) return false;
  return !current || isLowConfidencePartImageUrl(current);
}

async function hasUsableImageDimensions(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "SUPERCAR DASH part catalog enrichment (+https://supercardash.vercel.app)",
      },
    });
    if (!response.ok) return false;
    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    return (metadata.width ?? 0) >= 320 && (metadata.height ?? 0) >= 180;
  } catch {
    return false;
  }
}

const vehicleTokenGroups = [
  ["huracan", "huracan", "hurac-n"],
  ["aventador"],
  ["murcielago", "murcilago"],
  ["gallardo"],
  ["f12"],
  ["812"],
  ["supra"],
  ["rsx"],
  ["gt-r", "gtr"],
];

function hasConflictingVehicleToken(candidateUrl: string, partName: string) {
  const url = candidateUrl.toLowerCase();
  const name = partName.toLowerCase();

  for (const group of vehicleTokenGroups) {
    const urlHasToken = group.some((token) => url.includes(token));
    if (!urlHasToken) continue;

    const partHasToken = group.some((token) => name.includes(token));
    if (!partHasToken) return true;
  }

  return false;
}

function safeDescription(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

function mergeNotes(current: string | null, addition: string | null) {
  if (!addition) return current;
  if (current?.includes(addition)) return current;
  return [current, addition].filter(Boolean).join("\n");
}

function parseArgs(argv: string[]): EnrichmentArgs {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1];
  return {
    limit: limitArg ? Number(limitArg) : 25,
    dryRun: argv.includes("--dry-run"),
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
