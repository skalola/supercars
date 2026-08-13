import { PrismaClient } from "@prisma/client";
import { canonicalBaseModelName, scoreBaseModelFallback } from "@/lib/model-catalog/base-model";
import { normalizeCatalogText, scoreTitleMatch } from "@/lib/model-catalog/normalizer";
import { getBatchLimit, hasArg, isExecuteMode, logScriptMode } from "./lib/script-guards";

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
  execute: boolean;
};

type CandidateForMatch = {
  id: string;
  makeName: string;
  url: string;
  source: string;
  sourceName: string | null;
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  attributionUrl: string | null;
  title: string | null;
  context: string | null;
  category: string | null;
  baseModelName: string | null;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  logScriptMode("match-model-image-candidates", options.execute, options.limit);
  const models = await prisma.model.findMany({
    where: {
      ...(options.make ? { make: { name: { equals: options.make, mode: "insensitive" } } } : {}),
      metadataStatus: { not: "READY" },
    },
    select: {
      id: true,
      name: true,
      description: true,
      years: true,
      productionStartYear: true,
      productionEndYear: true,
      make: {
        select: { name: true },
      },
      images: {
        select: {
          type: true,
          reviewStatus: true,
        },
      },
      spec: {
        select: {
          engine: true,
          displacement: true,
          cylinders: true,
          horsepower: true,
          torque: true,
          transmission: true,
          drivetrain: true,
          topSpeed: true,
          zeroToSixty: true,
          weight: true,
        },
      },
    },
    orderBy: [
      { make: { name: "asc" } },
      { name: "asc" },
    ],
  });
  const missingModels = models
    .filter((model) => !model.images.some((image) => image.type?.toLowerCase() !== "candidate" && image.reviewStatus !== "NEEDS_REVIEW"))
    .slice(0, options.limit);
  const candidatesByMake = await getCandidatesByMake(unique(missingModels.map((model) => model.make.name)));

  let matched = 0;
  let skipped = 0;

  for (const model of missingModels) {
    const candidates = candidatesByMake.get(model.make.name) ?? [];

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
            source: candidate.source,
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
    if (options.execute) {
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
  candidate: { baseModelName: string | null; source: string; title: string | null; context: string | null; category: string | null },
) {
  const targetBase = canonicalBaseModelName(model.modelName, model.makeName);
  const candidateBase = candidate.baseModelName || canonicalBaseModelName(candidate.title || candidate.context || "", model.makeName);
  const context = `${candidate.title || ""} ${candidate.category || ""} ${candidate.context || ""}`;
  const cleanMatchText = candidate.source === "OPENVERSE_POOL"
    ? `${candidate.title || ""} ${candidate.category || ""}`
    : `${candidate.title || ""} ${candidate.category || ""} ${candidate.baseModelName || ""}`;
  if (hasConflictingMake(context, model.makeName, model.modelName)) return 0;
  if (hasConflictingChassisCode(context, model.modelName)) return 0;
  if (candidate.source === "OPENVERSE_POOL" && !openverseHasRequiredModelTokens(cleanMatchText, model.modelName)) return 0;
  if (candidate.source.startsWith("WIKIDATA_COMMONS_") && !wikidataHasRequiredModelFamily(cleanMatchText, model.makeName, model.modelName)) return 0;
  if (/\b(rc|radio controlled|controlled mode car|model car|toy car|toyota model car|diecast|scale model|lego|headlight|taillight|tail light|lamp|leuchte|patent|exhaust|silencer)\b/i.test(context)) return 0;

  const exactScore = scoreTitleMatch(cleanMatchText, model.makeName, model.modelName);
  const contextBase = canonicalBaseModelName(cleanMatchText, model.makeName);
  const trustedCandidateBase = candidateBase && contextSupportsBase(contextBase, candidateBase, targetBase) ? candidateBase : contextBase;
  const baseScore = scoreBaseModelFallback(targetBase, trustedCandidateBase);
  let score = Math.max(exactScore, baseScore);
  if ((candidate.source.startsWith("COMMONS_") || candidate.source.startsWith("WIKIDATA_COMMONS_")) && exactScore >= 50 && hasMakeAndBaseMatch(cleanMatchText, model.makeName, targetBase, candidateBase)) {
    score = Math.max(score, 88);
  }
  const normalizedContext = normalizeCatalogText(context);
  const normalizedTargetBase = normalizeCatalogText(targetBase);
  if (normalizedTargetBase && normalizedContext.includes(normalizedTargetBase) && !hasExtraDistinctiveModelTokens(contextBase, targetBase)) {
    score += 6;
  }
  if (/\b(logo|badge|emblem|interior|wheel|engine|toy car|toyota model car|diecast|scale model)\b/i.test(cleanMatchText)) {
    score -= 45;
  }

  return Math.max(0, Math.min(100, score));
}

async function getCandidatesByMake(makeNames: string[]) {
  if (makeNames.length === 0) return new Map<string, CandidateForMatch[]>();

  const candidates = await prisma.modelImageCandidate.findMany({
    where: {
      makeName: { in: makeNames },
      reviewStatus: { not: "REJECTED" },
      license: { not: null },
    },
    select: {
      id: true,
      makeName: true,
      url: true,
      source: true,
      sourceName: true,
      sourceUrl: true,
      license: true,
      attribution: true,
      attributionUrl: true,
      title: true,
      context: true,
      category: true,
      baseModelName: true,
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(2000, Math.max(200, makeNames.length * 400)),
  });

  return candidates.reduce((map, candidate) => {
    const rows = map.get(candidate.makeName) ?? [];
    rows.push(candidate);
    map.set(candidate.makeName, rows);
    return map;
  }, new Map<string, CandidateForMatch[]>());
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

function hasMakeAndBaseMatch(value: string, makeName: string, targetBase: string, candidateBase: string) {
  const normalizedValue = ` ${normalizeCatalogText(value)} `;
  const normalizedMake = normalizeCatalogText(makeName);
  const normalizedTargetBase = normalizeCatalogText(targetBase);
  const normalizedCandidateBase = normalizeCatalogText(candidateBase);
  if (!normalizedMake || !normalizedTargetBase) return false;
  if (!normalizedValue.includes(` ${normalizedMake} `)) return false;
  const compactValue = normalizedValue.replace(/\s+/g, "");
  const compactTarget = normalizedTargetBase.replace(/\s+/g, "");
  const compactCandidate = normalizedCandidateBase.replace(/\s+/g, "");
  return (
    ` ${normalizedCandidateBase} `.includes(` ${normalizedTargetBase} `) ||
    normalizedValue.includes(` ${normalizedTargetBase} `) ||
    (compactTarget.length >= 2 && compactCandidate.includes(compactTarget)) ||
    (compactTarget.length >= 2 && compactValue.includes(compactTarget))
  );
}

function openverseHasRequiredModelTokens(value: string, modelName: string) {
  const normalizedValue = ` ${normalizeCatalogText(value)} `;
  const compactValue = normalizedValue.replace(/\s+/g, "");
  const highSignalTokens = normalizeCatalogText(modelName)
    .split(" ")
    .filter((token) => ["dtm", "gt3", "gt4", "gt500", "gt300", "vgt", "trophy", "hemi", "pikes", "peak"].includes(token) || /^[rs][0-9]+$/.test(token) || /^[0-9]{3}$/.test(token));
  if (highSignalTokens.length > 0) {
    return highSignalTokens.every((token) => normalizedValue.includes(` ${token} `) || compactValue.includes(token));
  }
  const requiredTokens = normalizeCatalogText(modelName)
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !["coupe", "sedan", "roadster", "safety", "car", "touring", "racing", "edition", "limited", "premium", "performance"].includes(token));
  if (requiredTokens.length === 0) return true;
  const strongestTokens = requiredTokens.filter((token) => /[0-9]/.test(token) || token.length >= 4);
  const tokensToCheck = strongestTokens.length > 0 ? strongestTokens : requiredTokens;
  return tokensToCheck.some((token) => normalizedValue.includes(` ${token} `) || compactValue.includes(token));
}

function wikidataHasRequiredModelFamily(value: string, makeName: string, modelName: string) {
  const targetBase = canonicalBaseModelName(modelName, makeName);
  const normalizedValue = ` ${normalizeCatalogText(value)} `;
  const compactValue = normalizedValue.replace(/\s+/g, "");
  const tokens = targetBase
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !["safety", "car", "race", "racing", "road", "touring"].includes(token));
  if (tokens.length === 0) return true;
  return tokens.some((token) => normalizedValue.includes(` ${token} `) || compactValue.includes(token));
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

function hasConflictingChassisCode(context: string, modelName: string) {
  const normalizedContext = normalizeCatalogText(context);
  const normalizedModel = normalizeCatalogText(modelName);
  const groups = [
    ["s13", "s14", "s15"],
    ["r32", "r33", "r34", "r35"],
    ["na", "nb", "nc", "nd"],
    ["ae86", "zn6", "zn8"],
    ["901", "930", "964", "991", "992", "993"],
  ];

  return groups.some((group) => {
    const expected = group.find((code) => normalizedModel.includes(code));
    if (!expected) return false;
    return group.some((code) => code !== expected && normalizedContext.includes(code) && !normalizedContext.includes(expected));
  });
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
    limit: getBatchLimit({ defaultLimit: 80, maxLimit: 250 }),
    minConfidence: Math.max(0, Math.min(100, Number(getValue("min-confidence")) || 86)),
    execute: isExecuteMode() && !hasArg("--dry-run"),
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

main()
  .catch((error) => {
    console.error("[model-image-match] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
