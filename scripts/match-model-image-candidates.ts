import { PrismaClient } from "@prisma/client";
import { canonicalBaseModelName, scoreBaseModelFallback } from "@/lib/model-catalog/base-model";
import { normalizeCatalogText, scoreTitleMatch } from "@/lib/model-catalog/normalizer";

const prisma = new PrismaClient();
const KNOWN_MAKE_ALIASES = [
  "acura",
  "alfa romeo",
  "aston martin",
  "audi",
  "bmw",
  "bugatti",
  "cadillac",
  "chevrolet",
  "citroen",
  "citroën",
  "dodge",
  "ferrari",
  "ford",
  "honda",
  "hyundai",
  "jaguar",
  "koenigsegg",
  "lamborghini",
  "land rover",
  "lexus",
  "mazda",
  "mclaren",
  "mercedes",
  "mercedes benz",
  "mitsubishi",
  "nissan",
  "peugeot",
  "porsche",
  "renault",
  "subaru",
  "suzuki",
  "toyota",
  "volkswagen",
];

type CliOptions = {
  make: string | null;
  limit: number;
  minConfidence: number;
  dryRun: boolean;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const models = await prisma.model.findMany({
    where: {
      ...(options.make ? { make: { name: { equals: options.make, mode: "insensitive" } } } : {}),
      metadataStatus: { not: "READY" },
    },
    include: {
      make: true,
      images: true,
      spec: true,
    },
    orderBy: [
      { make: { name: "asc" } },
      { name: "asc" },
    ],
  });
  const missingModels = models
    .filter((model) => !model.images.some((image) => image.type?.toLowerCase() !== "candidate" && image.reviewStatus !== "NEEDS_REVIEW"))
    .slice(0, options.limit);

  let matched = 0;
  let skipped = 0;

  for (const model of missingModels) {
    const candidates = await prisma.modelImageCandidate.findMany({
      where: {
        makeName: model.make.name,
        reviewStatus: { not: "REJECTED" },
        license: { not: null },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const best = candidates
      .map((candidate) => ({
        candidate,
        confidence: scoreCandidateForModel(
          {
            makeName: model.make.name,
            modelName: model.name,
          },
          {
            baseModelName: candidate.baseModelName,
            title: candidate.title,
            context: candidate.context,
            category: candidate.category,
          },
        ),
      }))
      .filter((item) => item.confidence >= options.minConfidence)
      .sort((a, b) => b.confidence - a.confidence)[0] || null;

    if (!best) {
      skipped += 1;
      continue;
    }

    console.log(`[model-image-match] ${model.make.name} ${model.name} -> ${best.candidate.sourceName || best.candidate.source} (${best.confidence})`);
    if (!options.dryRun) {
      await prisma.modelImage.upsert({
        where: {
          modelId_url: {
            modelId: model.id,
            url: best.candidate.url,
          },
        },
        update: {
          source: best.candidate.source,
          sourceName: best.candidate.sourceName,
          sourceUrl: best.candidate.sourceUrl,
          license: best.candidate.license,
          attribution: best.candidate.attribution,
          attributionUrl: best.candidate.attributionUrl,
          confidence: best.confidence,
          reviewStatus: "APPROVED",
          type: "hero",
        },
        create: {
          modelId: model.id,
          url: best.candidate.url,
          source: best.candidate.source,
          sourceName: best.candidate.sourceName,
          sourceUrl: best.candidate.sourceUrl,
          license: best.candidate.license,
          attribution: best.candidate.attribution,
          attributionUrl: best.candidate.attributionUrl,
          confidence: best.confidence,
          reviewStatus: "APPROVED",
          type: "hero",
        },
      });
      await prisma.modelImageCandidate.update({
        where: { id: best.candidate.id },
        data: {
          matchedModelId: model.id,
          confidence: best.confidence,
          reviewStatus: "APPROVED",
        },
      });
      await prisma.model.update({
        where: { id: model.id },
        data: {
          metadataStatus: getNextStatus({
            hasDescription: Boolean(model.description),
            hasProductionYears: Boolean(model.years || model.productionStartYear || model.productionEndYear),
            hasSpecs: hasSpecs(model.spec),
          }),
          metadataConfidence: best.confidence,
          metadataSource: best.candidate.sourceName || best.candidate.source,
          metadataSourceUrl: best.candidate.sourceUrl,
          lastMetadataAuditAt: new Date(),
        },
      });
    }
    matched += 1;
  }

  console.log(`[model-image-match] Missing models scanned: ${missingModels.length}`);
  console.log(`[model-image-match] Matched: ${matched}`);
  console.log(`[model-image-match] Skipped: ${skipped}`);
}

function scoreCandidateForModel(
  model: { makeName: string; modelName: string },
  candidate: { baseModelName: string | null; title: string | null; context: string | null; category: string | null },
) {
  const targetBase = canonicalBaseModelName(model.modelName, model.makeName);
  const candidateBase = candidate.baseModelName || canonicalBaseModelName(candidate.title || candidate.context || "", model.makeName);
  const context = `${candidate.title || ""} ${candidate.category || ""} ${candidate.context || ""}`;
  if (hasConflictingMake(context, model.makeName, model.modelName)) return 0;
  if (/\b(rc|radio controlled|controlled mode car|model car|toy|diecast|scale model|lego|headlight|taillight|tail light|lamp|leuchte|patent)\b/i.test(context)) return 0;

  const exactScore = scoreTitleMatch(context, model.makeName, model.modelName);
  const contextBase = canonicalBaseModelName(context, model.makeName);
  const trustedCandidateBase = candidateBase && contextSupportsBase(contextBase, candidateBase, targetBase) ? candidateBase : contextBase;
  const baseScore = scoreBaseModelFallback(targetBase, trustedCandidateBase);
  let score = Math.max(exactScore, baseScore);

  const normalizedContext = normalizeCatalogText(context);
  const normalizedTargetBase = normalizeCatalogText(targetBase);
  if (normalizedTargetBase && normalizedContext.includes(normalizedTargetBase) && !hasExtraDistinctiveModelTokens(contextBase, targetBase)) {
    score += 6;
  }
  if (/logo|badge|emblem|interior|wheel|engine|toy|diecast|scale model/i.test(context)) {
    score -= 45;
  }

  return Math.max(0, Math.min(100, score));
}

function hasConflictingMake(context: string, makeName: string, modelName: string) {
  const normalizedContext = ` ${normalizeCatalogText(context)} `;
  const normalizedMake = normalizeCatalogText(makeName);
  const normalizedModel = ` ${normalizeCatalogText(modelName)} `;
  return KNOWN_MAKE_ALIASES.some((make) => {
    const normalizedAlias = normalizeCatalogText(make);
    return normalizedAlias !== normalizedMake && !normalizedModel.includes(` ${normalizedAlias} `) && normalizedContext.includes(` ${normalizedAlias} `);
  });
}

function contextSupportsBase(contextBase: string, candidateBase: string, targetBase: string) {
  if (!candidateBase || !targetBase) return false;
  if (contextBase === candidateBase) return true;
  const contextTokens = new Set(contextBase.split(" ").filter((token) => !isShortOrGeneric(token)));
  const candidateTokens = candidateBase.split(" ").filter((token) => !isShortOrGeneric(token));
  return candidateTokens.length > 0 && candidateTokens.every((token) => contextTokens.has(token));
}

function hasExtraDistinctiveModelTokens(contextBase: string, targetBase: string) {
  const targetTokens = new Set(targetBase.split(" ").filter((token) => !isShortOrGeneric(token)));
  const contextTokens = contextBase.split(" ").filter((token) => !isShortOrGeneric(token));
  return contextTokens.some((token) => !targetTokens.has(token));
}

function isShortOrGeneric(token: string) {
  return token.length <= 1 || ["car", "auto", "vehicle", "classic", "race", "racing", "sports", "sport"].includes(token);
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

function getNextStatus(input: { hasDescription: boolean; hasProductionYears: boolean; hasSpecs: boolean }) {
  return input.hasDescription && input.hasProductionYears && input.hasSpecs ? "READY" : "PARTIAL";
}

function parseOptions(args: string[]): CliOptions {
  const getValue = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return {
    make: getValue("make") || null,
    limit: Math.max(1, Number(getValue("limit")) || 80),
    minConfidence: Math.max(0, Math.min(100, Number(getValue("min-confidence")) || 86)),
    dryRun: args.includes("--dry-run"),
  };
}

main()
  .catch((error) => {
    console.error("[model-image-match] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
