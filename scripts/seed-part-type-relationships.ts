import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const RELATIONSHIPS = [
  { source: "downpipe", target: "ecu-tune", type: "REQUIRES", reason: "Downpipe changes generally require matching ECU calibration." },
  { source: "downpipes", target: "ecu-tune", type: "REQUIRES", reason: "Downpipe changes generally require matching ECU calibration." },
  { source: "turbocharger", target: "ecu-tune", type: "REQUIRES", reason: "Turbocharger changes require calibrated engine management." },
  { source: "turbocharger", target: "intercooler", type: "RECOMMENDS", reason: "Charge-air cooling supports repeatable forced-induction performance." },
  { source: "turbocharger", target: "fuel-injector", type: "RECOMMENDS", reason: "Fuel-system capacity should be validated for increased airflow." },
  { source: "performance-exhaust", target: "ecu-tune", type: "RECOMMENDS", reason: "Calibration may optimize a freer-flowing exhaust configuration." },
  { source: "intake-system", target: "ecu-tune", type: "RECOMMENDS", reason: "Calibration may optimize a higher-flow intake configuration." },
  { source: "carbon-intake", target: "ecu-tune", type: "RECOMMENDS", reason: "Calibration may optimize a higher-flow intake configuration." },
] as const;

async function main() {
  const slugs = [...new Set(RELATIONSHIPS.flatMap((item) => [item.source, item.target]))];
  const partTypes = await prisma.partComponentType.findMany({
    where: { slug: { in: slugs }, active: true },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(partTypes.map((partType) => [partType.slug, partType]));
  let upserted = 0;
  const skipped: string[] = [];
  for (const relationship of RELATIONSHIPS) {
    const source = bySlug.get(relationship.source);
    const target = bySlug.get(relationship.target);
    if (!source || !target) {
      skipped.push(`${relationship.source}:${relationship.type}:${relationship.target}`);
      continue;
    }
    await prisma.partTypeRelationship.upsert({
      where: {
        sourcePartTypeId_targetPartTypeId_relationshipType: {
          sourcePartTypeId: source.id,
          targetPartTypeId: target.id,
          relationshipType: relationship.type,
        },
      },
      update: { reason: relationship.reason, active: true },
      create: {
        sourcePartTypeId: source.id,
        targetPartTypeId: target.id,
        relationshipType: relationship.type,
        reason: relationship.reason,
      },
    });
    upserted += 1;
  }
  console.log(JSON.stringify({ configured: RELATIONSHIPS.length, upserted, skipped }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
