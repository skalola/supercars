import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { evaluateCatalogIdentity } from "@/lib/model-catalog/lineup/quality-gate";
import { familyKey } from "@/lib/model-catalog/lineup/normalizer";
import { isApprovedOfficialCatalogUrl } from "@/lib/model-catalog/lineup/oem-hosts";
import type { ModelLineupCandidate } from "@/lib/model-catalog/lineup/types";

type OfficialLineupRecord = Omit<ModelLineupCandidate, "sourceType" | "confidence" | "makeName"> & { makeSlug: string };

async function main() {
  const input = process.argv.find((arg) => arg.startsWith("--input="))?.split("=")[1];
  if (!input) throw new Error("Usage: npm run ingest-oem-model-lineup -- --input=lineup.json [--apply]");
  const apply = process.argv.includes("--apply");
  const records = JSON.parse(await readFile(resolve(input), "utf8")) as OfficialLineupRecord[];
  const summary = { accepted: 0, rejected: 0, created: 0, linked: 0, variants: 0 };

  for (const record of records) {
    if (!record.sourceUrl || !isApprovedOfficialCatalogUrl(record.makeSlug, record.sourceUrl)) {
      summary.rejected += 1;
      console.warn(`[oem-lineup] Rejected ${record.makeSlug}/${record.modelName}: source is not an approved official host.`);
      continue;
    }
    const make = await prisma.make.findUnique({
      where: { slug: record.makeSlug },
      select: { id: true, name: true, models: { select: { id: true, name: true, slug: true, variants: { select: { id: true, name: true } } } } },
    });
    if (!make) { summary.rejected += 1; continue; }
    const candidate: ModelLineupCandidate = { ...record, makeName: make.name, sourceType: "OEM", confidence: "SOURCE_VERIFIED" };
    const decision = evaluateCatalogIdentity(candidate, make.models);
    if (decision.action === "REJECT") { summary.rejected += 1; continue; }
    summary.accepted += 1;
    if (!apply) continue;

    let model = make.models.find((item) => normalize(item.name) === normalize(decision.canonicalFamilyName));
    if (!model) {
      const created = await prisma.model.create({
        data: {
          makeId: make.id, name: decision.canonicalFamilyName, slug: uniqueSlug(decision.canonicalFamilyName, make.models.map((item) => item.slug)),
          years: formatYears(record.productionStartYear, record.productionEndYear), productionStartYear: record.productionStartYear,
          productionEndYear: record.productionEndYear, bodyStyle: record.bodyStyle, category: record.category,
          metadataStatus: "PARTIAL", metadataConfidence: 1, metadataSource: record.sourceName,
          metadataSourceUrl: record.sourceUrl, lastMetadataAuditAt: new Date(),
        },
        select: { id: true, name: true, slug: true, variants: { select: { id: true, name: true } } },
      });
      model = created;
      summary.created += 1;
    } else summary.linked += 1;

    let variantId: string | null = null;
    if (record.variantName && normalize(record.variantName) !== normalize(model.name)) {
      const variant = await prisma.modelVariant.upsert({
        where: { modelId_slug: { modelId: model.id, slug: slugify(record.variantName) } },
        create: { modelId: model.id, name: record.variantName, slug: slugify(record.variantName), productionStartYear: record.productionStartYear, productionEndYear: record.productionEndYear },
        update: { productionStartYear: record.productionStartYear, productionEndYear: record.productionEndYear },
        select: { id: true },
      });
      variantId = variant.id;
      summary.variants += 1;
    }

    const evidenceKey = hash(["OEM", record.sourceName, record.externalId || record.sourceUrl, make.name, record.modelName, record.variantName || ""].join("|"));
    await prisma.modelCatalogEvidence.upsert({
      where: { evidenceKey },
      create: {
        evidenceKey, sourceType: "OEM", sourceName: record.sourceName, sourceUrl: record.sourceUrl, externalId: record.externalId,
        makeName: make.name, modelName: record.modelName, canonicalFamilyName: model.name,
        normalizedFamilyKey: familyKey(make.name, model.name), productionStartYear: record.productionStartYear,
        productionEndYear: record.productionEndYear, bodyStyle: record.bodyStyle, category: record.category,
        confidence: "SOURCE_VERIFIED", reviewStatus: "SOURCE_VERIFIED", payloadHash: record.payloadHash,
        makeId: make.id, modelId: model.id, variantId,
      },
      update: { lastSeenAt: new Date(), modelId: model.id, variantId, reviewStatus: "SOURCE_VERIFIED" },
    });
  }
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "AUDIT", ...summary }, null, 2));
}

function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function uniqueSlug(name: string, used: string[]) { const base = slugify(name); let value = base; let index = 2; while (used.includes(value)) value = `${base}-${index++}`; return value; }
function formatYears(start?: number | null, end?: number | null) { if (!start && !end) return null; if (!end || start === end) return String(start || end); return `${start}-${end}`; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

main().catch((error) => { console.error("[oem-lineup] Fatal error:", error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
