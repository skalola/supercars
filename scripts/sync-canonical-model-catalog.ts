import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MAKER_SITE_CONFIGS } from "@/lib/maker-sites/config";
import { evaluateCatalogIdentity } from "@/lib/model-catalog/lineup/quality-gate";
import { normalizeLineupCandidate } from "@/lib/model-catalog/lineup/normalizer";
import { nhtsaLineupSource } from "@/lib/model-catalog/lineup/sources/nhtsa";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const makeFilter = args.find((arg) => arg.startsWith("--make="))?.split("=")[1];
  const endYear = new Date().getUTCFullYear() + 1;
  const makers = MAKER_SITE_CONFIGS.filter((item) => !makeFilter || item.slug === makeFilter);
  const totals = { candidates: 0, linked: 0, created: 0, review: 0, rejected: 0 };

  for (const configured of makers) {
    const make = await prisma.make.findUnique({
      where: { slug: configured.slug },
      select: { id: true, name: true, models: { select: { id: true, name: true, slug: true, variants: { select: { id: true, name: true } } } } },
    });
    if (!make) continue;
    const candidates = await nhtsaLineupSource.fetchCandidates({ makeName: make.name, startYear: 1981, endYear });
    for (const raw of candidates) {
      const candidate = normalizeLineupCandidate(raw);
      const decision = evaluateCatalogIdentity(candidate, make.models);
      totals.candidates += 1;
      if (decision.action === "REJECT") totals.rejected += 1;
      else if (decision.action === "REVIEW") totals.review += 1;
      else if (decision.action === "CREATE_MODEL") totals.created += 1;
      else totals.linked += 1;
      if (!apply) continue;

      const matched = make.models.find((model) => normalize(model.name) === normalize(decision.canonicalFamilyName));
      const evidenceKey = hash([candidate.sourceType, candidate.sourceName, candidate.externalId || candidate.sourceUrl || "", make.name, candidate.modelName].join("|"));
      await prisma.modelCatalogEvidence.upsert({
        where: { evidenceKey },
        create: {
          evidenceKey,
          sourceType: candidate.sourceType,
          sourceName: candidate.sourceName,
          sourceUrl: candidate.sourceUrl,
          externalId: candidate.externalId,
          makeName: make.name,
          modelName: candidate.modelName,
          canonicalFamilyName: decision.canonicalFamilyName,
          normalizedFamilyKey: decision.normalizedFamilyKey,
          productionStartYear: candidate.productionStartYear,
          productionEndYear: candidate.productionEndYear,
          bodyStyle: candidate.bodyStyle,
          category: candidate.category,
          confidence: candidate.confidence,
          reviewStatus: decision.reviewStatus,
          payloadHash: candidate.payloadHash,
          makeId: make.id,
          modelId: matched?.id,
        },
        update: {
          lastSeenAt: new Date(),
          productionStartYear: candidate.productionStartYear,
          productionEndYear: candidate.productionEndYear,
          confidence: candidate.confidence,
          reviewStatus: decision.reviewStatus,
          modelId: matched?.id,
        },
      });
    }
    console.log(`[catalog] ${make.name}: ${candidates.length} source identities evaluated.`);
  }

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "AUDIT", ...totals }, null, 2));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

main().catch((error) => {
  console.error("[catalog] Fatal error:", error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
