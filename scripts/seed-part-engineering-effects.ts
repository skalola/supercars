import { PrismaClient } from "@prisma/client";
import { buildPartEngineeringEffect } from "@/lib/parts/part-effects";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");

async function main() {
  const components = await prisma.partComponentType.findMany({
    where: { active: true },
    select: { id: true, name: true, engineeringEffect: true, category: { select: { slug: true } } },
    orderBy: [{ category: { displayOrder: "asc" } }, { displayOrder: "asc" }, { name: "asc" }],
  });
  const report = { mode: execute ? "execute" : "dry-run", scanned: components.length, created: 0, refreshedBaselines: 0, unchanged: 0, preservedReviewed: 0 };

  for (const component of components) {
    const definition = buildPartEngineeringEffect({ categorySlug: component.category.slug, componentName: component.name });
    if (!component.engineeringEffect) report.created += 1;
    else if (component.engineeringEffect.reviewStatus === "AUTO_BASELINE") {
      if (sameDefinition(component.engineeringEffect, definition)) {
        report.unchanged += 1;
        continue;
      }
      report.refreshedBaselines += 1;
    }
    else {
      report.preservedReviewed += 1;
      continue;
    }
    if (!execute) continue;

    await prisma.partEngineeringEffect.upsert({
      where: { componentTypeId: component.id },
      create: {
        componentTypeId: component.id,
        ...definition,
        reviewStatus: "AUTO_BASELINE",
      },
      update: {
        ...definition,
        active: true,
      },
    });
  }
  console.log(JSON.stringify(report, null, 2));
}

function sameDefinition(
  current: NonNullable<Awaited<ReturnType<typeof prisma.partEngineeringEffect.findFirst>>>,
  expected: ReturnType<typeof buildPartEngineeringEffect>,
) {
  return stableJson({
    contractVersion: current.contractVersion,
    primaryDimension: current.primaryDimension,
    benefits: current.benefits,
    tradeoffs: current.tradeoffs,
    dependencies: current.dependencies,
    risks: current.risks,
    buildIntentions: current.buildIntentions,
    confidence: current.confidence,
    evidenceBasis: current.evidenceBasis,
  }) === stableJson(expected);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

main().catch((error) => {
  console.error("[seed-part-engineering-effects] Failed", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
