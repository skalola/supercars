import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MAKER_SITE_CONFIGS } from "@/lib/maker-sites/config";
import { evaluateCatalogIdentity } from "@/lib/model-catalog/lineup/quality-gate";
import { normalizeLineupCandidate } from "@/lib/model-catalog/lineup/normalizer";
import type { ModelLineupSource } from "@/lib/model-catalog/lineup/source";
import { nhtsaLineupSource } from "@/lib/model-catalog/lineup/sources/nhtsa";
import { wikidataHeritageLineupSource } from "@/lib/model-catalog/lineup/sources/wikidata";
import { slugifyTrustedModel } from "@/lib/model-catalog/trusted-model-matcher";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const makeFilter = args.find((arg) => arg.startsWith("--make="))?.split("=")[1];
  const sourceFilter = args.find((arg) => arg.startsWith("--source="))?.split("=")[1] || "all";
  const endYear = new Date().getUTCFullYear() + 1;
  const makers = MAKER_SITE_CONFIGS.filter((item) => !makeFilter || item.slug === makeFilter);
  const totals = { candidates: 0, linked: 0, created: 0, review: 0, rejected: 0 };
  const sources = selectSources(sourceFilter);

  for (const configured of makers) {
    const make = await prisma.make.findUnique({
      where: { slug: configured.slug },
      select: {
        id: true,
        name: true,
        models: {
          select: {
            id: true,
            name: true,
            slug: true,
            productionStartYear: true,
            productionEndYear: true,
            variants: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!make) continue;
    let makeCandidateCount = 0;
    for (const source of sources) {
      const candidates = await source.fetchCandidates({ makeName: make.name, startYear: 1885, endYear });
      makeCandidateCount += candidates.length;
      for (const raw of candidates) {
        const candidate = normalizeLineupCandidate(raw);
        const decision = evaluateCatalogIdentity(candidate, make.models);
        totals.candidates += 1;
        if (decision.action === "REJECT") totals.rejected += 1;
        else if (decision.action === "REVIEW") totals.review += 1;
        else if (decision.action === "CREATE_MODEL") totals.created += 1;
        else totals.linked += 1;
        if (!apply) continue;

      let matched = make.models.find((model) => normalize(model.name) === normalize(decision.canonicalFamilyName));
      if (!matched && decision.action === "CREATE_MODEL") {
        const slug = uniqueSlug(decision.canonicalFamilyName, make.models.map((model) => model.slug));
        matched = await prisma.model.create({
          data: {
            makeId: make.id,
            name: decision.canonicalFamilyName,
            slug,
            years: formatYears(candidate.productionStartYear, candidate.productionEndYear),
            productionStartYear: candidate.productionStartYear,
            productionEndYear: candidate.productionEndYear,
            bodyStyle: candidate.bodyStyle,
            category: candidate.category,
            metadataStatus: "PARTIAL",
            metadataConfidence: candidate.confidence === "SOURCE_VERIFIED" ? 1 : 0.9,
            metadataSource: candidate.sourceName,
            metadataSourceUrl: candidate.sourceUrl,
            lastMetadataAuditAt: new Date(),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            productionStartYear: true,
            productionEndYear: true,
            variants: { select: { id: true, name: true } },
          },
        });
        make.models.push(matched);
      } else if (matched && (candidate.productionStartYear || candidate.productionEndYear)) {
        const productionStartYear = earliestYear(matched.productionStartYear, candidate.productionStartYear);
        const productionEndYear = latestYear(matched.productionEndYear, candidate.productionEndYear);
        if (productionStartYear !== matched.productionStartYear || productionEndYear !== matched.productionEndYear) {
          await prisma.model.update({
            where: { id: matched.id },
            data: {
              productionStartYear,
              productionEndYear,
              years: formatYears(productionStartYear, productionEndYear),
            },
          });
          matched.productionStartYear = productionStartYear;
          matched.productionEndYear = productionEndYear;
        }
      }
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
    }
    console.log(`[catalog] ${make.name}: ${makeCandidateCount} source identities evaluated from ${sources.map((source) => source.id).join(", ")}.`);
  }

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "AUDIT", ...totals }, null, 2));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function selectSources(value: string): ModelLineupSource[] {
  if (value === "all") return [nhtsaLineupSource, wikidataHeritageLineupSource];
  if (value === "nhtsa") return [nhtsaLineupSource];
  if (value === "wikidata") return [wikidataHeritageLineupSource];
  throw new Error(`Unknown catalog source '${value}'. Use all, nhtsa, or wikidata.`);
}

function uniqueSlug(name: string, used: string[]) {
  const base = slugifyTrustedModel(name) || "model";
  let value = base;
  let index = 2;
  while (used.includes(value)) value = `${base}-${index++}`;
  return value;
}

function formatYears(start?: number | null, end?: number | null) {
  if (!start && !end) return null;
  if (!end || start === end) return String(start || end);
  if (!start) return String(end);
  return `${start}-${end}`;
}

function earliestYear(left?: number | null, right?: number | null) {
  if (left == null) return right ?? null;
  if (right == null) return left;
  return Math.min(left, right);
}

function latestYear(left?: number | null, right?: number | null) {
  if (left == null) return right ?? null;
  if (right == null) return left;
  return Math.max(left, right);
}

main().catch((error) => {
  console.error("[catalog] Fatal error:", error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
