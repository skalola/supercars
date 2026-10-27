import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { validateMaintenanceSource } from "@/lib/model-catalog/maintenance/quality-gate";
import { OEM_MAINTENANCE_HOSTS } from "@/lib/model-catalog/maintenance/trusted-sources";
import type { MaintenanceSourceRecord } from "@/lib/model-catalog/maintenance/types";

async function main() {
  const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
  if (!inputArg) throw new Error("Usage: npm run ingest-oem-maintenance -- --input=records.json [--apply]");
  const apply = process.argv.includes("--apply");
  const records = JSON.parse(await readFile(resolve(inputArg.split("=")[1]), "utf8")) as MaintenanceSourceRecord[];
  const summary = { accepted: 0, rejected: 0, unresolved: 0, applied: 0 };

  for (const record of records) {
    const make = await prisma.make.findFirst({
      where: { name: { equals: record.makeName, mode: "insensitive" } },
      select: { id: true, slug: true, models: { select: { id: true, name: true, variants: { select: { id: true, name: true } } } } },
    });
    if (!make) { summary.unresolved += 1; continue; }
    const validation = validateMaintenanceSource(record, OEM_MAINTENANCE_HOSTS[make.slug] ?? new Set());
    if (!validation.accepted) {
      summary.rejected += 1;
      console.warn(`[maintenance] Rejected ${record.sourceKey}: ${validation.reasons.join(" ")}`);
      continue;
    }
    const model = record.modelName ? make.models.find((item) => normalize(item.name) === normalize(record.modelName!)) : null;
    const variant = record.variantName ? model?.variants.find((item) => normalize(item.name) === normalize(record.variantName!)) : null;
    if ((record.modelName && !model) || (record.variantName && !variant)) { summary.unresolved += 1; continue; }
    summary.accepted += 1;
    if (!apply) continue;
    const scope = variant ? "VARIANT" : model ? "MODEL" : record.powertrainType ? "POWERTRAIN" : "MAKE";
    await prisma.maintenanceRule.upsert({
      where: { sourceKey: record.sourceKey },
      create: {
        sourceKey: record.sourceKey, scope, makeId: make.id, modelId: model?.id, variantId: variant?.id,
        yearStart: record.yearStart, yearEnd: record.yearEnd, powertrainType: record.powertrainType,
        category: record.category, serviceName: record.serviceName, description: record.description,
        intervalMiles: record.intervalMiles, intervalMonths: record.intervalMonths, priority: record.priority,
        sourceType: record.sourceType, sourceName: record.sourceName, sourceUrl: record.sourceUrl,
        confidence: record.confidence, reviewStatus: "SOURCE_VERIFIED",
      },
      update: {
        scope, makeId: make.id, modelId: model?.id, variantId: variant?.id,
        yearStart: record.yearStart, yearEnd: record.yearEnd, powertrainType: record.powertrainType,
        category: record.category, serviceName: record.serviceName, description: record.description,
        intervalMiles: record.intervalMiles, intervalMonths: record.intervalMonths, priority: record.priority,
        sourceName: record.sourceName, sourceUrl: record.sourceUrl, confidence: record.confidence,
        reviewStatus: "SOURCE_VERIFIED",
      },
    });
    summary.applied += 1;
  }
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "AUDIT", ...summary }, null, 2));
}

function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ""); }

main().catch((error) => {
  console.error("[maintenance] Fatal error:", error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
