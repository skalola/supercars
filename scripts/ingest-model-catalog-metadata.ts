import { PrismaClient } from "@prisma/client";
import {
  canonicalBaseModelName,
  isBaseModelFallbackCompatible,
  scoreBaseModelFallback,
} from "@/lib/model-catalog/base-model";
import { findModelMetadataCandidates, type ModelCatalogRecord, type ModelMetadataCandidate } from "@/lib/model-catalog";

const prisma = new PrismaClient();

type CliOptions = {
  limit: number;
  offset: number;
  make: string | null;
  minConfidence: number;
  dryRun: boolean;
  includeReviewed: boolean;
  delayMs: number;
  storeReviewCandidates: boolean;
  missingImagesOnly: boolean;
  baseModelFallback: boolean;
};

type IngestStats = {
  scanned: number;
  candidatesFound: number;
  imagesCreated: number;
  imagesSkippedExisting: number;
  imagesSkippedLowConfidence: number;
  imagesSkippedManualReview: number;
  reviewImagesCreated: number;
  baseFallbackImagesCreated: number;
  metadataUpdated: number;
  descriptionsSkipped: number;
  rateLimitStops: number;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const stats: IngestStats = {
    scanned: 0,
    candidatesFound: 0,
    imagesCreated: 0,
    imagesSkippedExisting: 0,
    imagesSkippedLowConfidence: 0,
    imagesSkippedManualReview: 0,
    reviewImagesCreated: 0,
    baseFallbackImagesCreated: 0,
    metadataUpdated: 0,
    descriptionsSkipped: 0,
    rateLimitStops: 0,
  };

  const allModels = await prisma.model.findMany({
    where: {
      ...(options.make ? { make: { name: { equals: options.make, mode: "insensitive" } } } : {}),
      ...(options.includeReviewed ? {} : { metadataStatus: { not: "READY" } }),
    },
    include: {
      make: true,
      images: true,
      spec: true,
      variants: { select: { id: true } },
      maintenanceRules: { select: { id: true } },
      _count: {
        select: {
          listings: true,
          marketSales: true,
          marketSnapshots: true,
        },
      },
    },
    orderBy: [
      { make: { name: "asc" } },
      { name: "asc" },
    ],
  });
  const models = allModels
    .filter((model) => !options.missingImagesOnly || !hasDisplayableImage(model.images))
    .slice(options.offset, options.offset + options.limit);
  const fallbackModels = options.baseModelFallback
    ? await prisma.model.findMany({
        include: {
          make: true,
          images: true,
        },
        orderBy: [
          { make: { name: "asc" } },
          { name: "asc" },
        ],
      })
    : [];

  console.log(`[model-catalog-ingest] Selected ${models.length} model${models.length === 1 ? "" : "s"} from ${allModels.length} eligible row${allModels.length === 1 ? "" : "s"} at offset ${options.offset}.`);

  for (const model of models) {
    stats.scanned += 1;
    if (stats.scanned === 1 || stats.scanned % 10 === 0 || stats.scanned === models.length) {
      console.log(`[model-catalog-ingest] Processing ${stats.scanned}/${models.length}: ${model.make.name} ${model.name}`);
    }

    const record: ModelCatalogRecord = {
      modelId: model.id,
      makeName: model.make.name,
      modelName: model.name,
      slug: model.slug,
      years: model.years,
      productionStartYear: model.productionStartYear,
      productionEndYear: model.productionEndYear,
    };

    const candidates = await findModelMetadataCandidates(record);
    const candidate = selectCandidate(candidates, options.minConfidence);
    if (!candidate) continue;

    stats.candidatesFound += 1;
    if (candidate.notes.some((note) => /HTTP 429|rate limit/i.test(note))) {
      stats.rateLimitStops += 1;
      console.warn(`[model-catalog-ingest] Source rate limit reached at ${model.make.name} ${model.name}. Ending batch early.`);
      break;
    }

    const hasExistingImage = model.images.some((image) => image.url === candidate.imageUrl);
    const hasAnyImage = model.images.length > 0;
    const approved =
      Boolean(candidate.imageUrl) &&
      candidate.confidence >= options.minConfidence &&
      !candidate.requiresManualReview;

    let imageCreatedForModel = false;

    if (!candidate.imageUrl || candidate.confidence < options.minConfidence) {
      stats.imagesSkippedLowConfidence += 1;
    } else if (candidate.requiresManualReview) {
      if (!hasExistingImage && options.storeReviewCandidates) {
        if (!options.dryRun) {
          await prisma.modelImage.create({
            data: {
              modelId: model.id,
              url: candidate.imageUrl,
              type: "candidate",
              source: candidate.sourceName,
              sourceName: candidate.sourceName,
              sourceUrl: candidate.imageSourceUrl || candidate.sourceUrl,
              license: candidate.imageLicense,
              attribution: candidate.imageAttribution,
              attributionUrl: candidate.imageAttributionUrl,
              confidence: candidate.confidence,
              reviewStatus: "NEEDS_REVIEW",
            },
          });
        }
        stats.reviewImagesCreated += 1;
      } else {
        stats.imagesSkippedManualReview += 1;
      }
    } else if (hasExistingImage) {
      stats.imagesSkippedExisting += 1;
    } else if (!options.dryRun) {
      await prisma.modelImage.create({
        data: {
          modelId: model.id,
          url: candidate.imageUrl,
          type: hasAnyImage ? "reference" : "hero",
          source: candidate.sourceName,
          sourceName: candidate.sourceName,
          sourceUrl: candidate.imageSourceUrl || candidate.sourceUrl,
          license: candidate.imageLicense,
          attribution: candidate.imageAttribution,
          attributionUrl: candidate.imageAttributionUrl,
          confidence: candidate.confidence,
          reviewStatus: "APPROVED",
        },
      });
      stats.imagesCreated += 1;
      imageCreatedForModel = true;
    } else {
      stats.imagesCreated += 1;
      imageCreatedForModel = true;
    }

    if (!imageCreatedForModel && options.baseModelFallback && !hasDisplayableImage(model.images)) {
      const fallback = findBaseModelFallback(model, fallbackModels);
      if (fallback && !model.images.some((image) => image.url === fallback.image.url)) {
        if (!options.dryRun) {
          await prisma.modelImage.create({
            data: {
              modelId: model.id,
              url: fallback.image.url,
              type: "hero",
              source: "BASE_MODEL_FALLBACK",
              sourceName: `Base model fallback from ${fallback.sourceModel.make.name} ${fallback.sourceModel.name}`,
              sourceUrl: fallback.image.sourceUrl,
              license: fallback.image.license,
              attribution: fallback.image.attribution,
              attributionUrl: fallback.image.attributionUrl,
              confidence: fallback.confidence,
              reviewStatus: "APPROVED",
            },
          });
        }
        stats.baseFallbackImagesCreated += 1;
        imageCreatedForModel = true;
      }
    }

    if (!options.dryRun) {
      await prisma.model.update({
        where: { id: model.id },
        data: {
          metadataStatus: getNextStatus({
            hasImage: hasAnyImage || approved || imageCreatedForModel,
            hasDescription: Boolean(model.description),
            hasProductionYears: Boolean(model.years || model.productionStartYear || model.productionEndYear),
            hasSpecs: hasSpecs(model.spec),
            candidateApproved: approved,
          }),
          metadataConfidence: candidate.confidence,
          metadataSource: candidate.sourceName,
          metadataSourceUrl: candidate.sourceUrl,
          lastMetadataAuditAt: new Date(),
        },
      });
    }
    stats.metadataUpdated += 1;

    if (candidate.description && !model.description) {
      stats.descriptionsSkipped += 1;
    }

    if (options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  console.log(`[model-catalog-ingest] Scanned: ${stats.scanned}`);
  console.log(`[model-catalog-ingest] Candidates found: ${stats.candidatesFound}`);
  console.log(`[model-catalog-ingest] Images ${options.dryRun ? "eligible" : "created"}: ${stats.imagesCreated}`);
  console.log(`[model-catalog-ingest] Images skipped existing: ${stats.imagesSkippedExisting}`);
  console.log(`[model-catalog-ingest] Images skipped low confidence/no image: ${stats.imagesSkippedLowConfidence}`);
  console.log(`[model-catalog-ingest] Images skipped manual review: ${stats.imagesSkippedManualReview}`);
  console.log(`[model-catalog-ingest] Review candidate images ${options.dryRun ? "eligible" : "created"}: ${stats.reviewImagesCreated}`);
  console.log(`[model-catalog-ingest] Base fallback images ${options.dryRun ? "eligible" : "created"}: ${stats.baseFallbackImagesCreated}`);
  console.log(`[model-catalog-ingest] Metadata rows ${options.dryRun ? "eligible" : "updated"}: ${stats.metadataUpdated}`);
  console.log(`[model-catalog-ingest] Descriptions skipped to avoid copying source text verbatim: ${stats.descriptionsSkipped}`);
  console.log(`[model-catalog-ingest] Rate limit stops: ${stats.rateLimitStops}`);
}

function hasSpecs(spec: {
  engine?: string | null;
  displacement?: string | null;
  cylinders?: string | null;
  horsepower?: string | null;
  torque?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  topSpeed?: string | null;
  zeroToSixty?: string | null;
  weight?: string | null;
} | null) {
  return Boolean(
    spec &&
      [
        spec.engine,
        spec.displacement,
        spec.cylinders,
        spec.horsepower,
        spec.torque,
        spec.transmission,
        spec.drivetrain,
        spec.topSpeed,
        spec.zeroToSixty,
        spec.weight,
      ].some((value) => typeof value === "string" && value.trim().length > 0),
  );
}

function getNextStatus(input: {
  hasImage: boolean;
  hasDescription: boolean;
  hasProductionYears: boolean;
  hasSpecs: boolean;
  candidateApproved: boolean;
}) {
  if (input.hasImage && input.hasDescription && input.hasProductionYears && input.hasSpecs) {
    return "READY";
  }

  if (input.candidateApproved || input.hasImage) {
    return "PARTIAL";
  }

  return "NEEDS_REVIEW";
}

function selectCandidate(candidates: ModelMetadataCandidate[], minConfidence: number) {
  return (
    candidates.find((candidate) => Boolean(candidate.imageUrl) && !candidate.requiresManualReview && candidate.confidence >= minConfidence) ||
    candidates.find((candidate) => Boolean(candidate.imageUrl) && candidate.confidence >= minConfidence) ||
    candidates[0] ||
    null
  );
}

function hasDisplayableImage(images: Array<{ type: string | null; reviewStatus: string }>) {
  return images.some((image) => image.type?.toLowerCase() !== "candidate" && image.reviewStatus !== "NEEDS_REVIEW");
}

type BaseFallbackModel = {
  id: string;
  name: string;
  make: {
    name: string;
  };
  images: Array<{
    url: string;
    type: string | null;
    sourceUrl: string | null;
    license: string | null;
    attribution: string | null;
    attributionUrl: string | null;
    reviewStatus: string;
  }>;
};

function findBaseModelFallback(target: BaseFallbackModel, models: BaseFallbackModel[]) {
  const targetBase = canonicalBaseModelName(target.name, target.make.name);
  if (!targetBase) return null;

  return models
    .filter((model) => model.id !== target.id && model.make.name === target.make.name)
    .map((sourceModel) => {
      const sourceBase = canonicalBaseModelName(sourceModel.name, sourceModel.make.name);
      const confidence = scoreBaseModelFallback(targetBase, sourceBase);
      const image = sourceModel.images.find((item) => item.reviewStatus !== "NEEDS_REVIEW" && item.type?.toLowerCase() !== "candidate");
      return image ? { sourceModel, image, confidence } : null;
    })
    .filter((item) => item !== null)
    .filter((item) => isBaseModelFallbackCompatible(target.name, item.sourceModel.name, target.make.name))
    .filter((item) => item.confidence >= 82)
    .sort((a, b) => b.confidence - a.confidence)[0] || null;
}

function parseOptions(args: string[]): CliOptions {
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const offsetArg = args.find((arg) => arg.startsWith("--offset="));
  const makeArg = args.find((arg) => arg.startsWith("--make="));
  const minConfidenceArg = args.find((arg) => arg.startsWith("--min-confidence="));
  const delayArg = args.find((arg) => arg.startsWith("--delay-ms="));

  return {
    limit: limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 25) : 25,
    offset: offsetArg ? Math.max(0, Number(offsetArg.split("=")[1]) || 0) : 0,
    make: makeArg ? makeArg.split("=").slice(1).join("=").trim() || null : null,
    minConfidence: minConfidenceArg ? Math.max(0, Math.min(100, Number(minConfidenceArg.split("=")[1]) || 88)) : 88,
    dryRun: args.includes("--dry-run"),
    includeReviewed: args.includes("--include-reviewed"),
    delayMs: delayArg ? Math.max(0, Number(delayArg.split("=")[1]) || 0) : 1200,
    storeReviewCandidates: args.includes("--store-review-candidates"),
    missingImagesOnly: args.includes("--missing-images-only"),
    baseModelFallback: args.includes("--base-model-fallback"),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((error) => {
    console.error("[model-catalog-ingest] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
