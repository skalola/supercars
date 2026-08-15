import { PrismaClient } from "@prisma/client";
import { partEngineeringEffectSchema } from "@/lib/parts/part-effects";

const prisma = new PrismaClient();

async function main() {
  const components = await prisma.partComponentType.findMany({
    where: { active: true },
    select: { name: true, category: { select: { name: true, slug: true } }, engineeringEffect: true },
    orderBy: [{ category: { displayOrder: "asc" } }, { displayOrder: "asc" }, { name: "asc" }],
  });
  const missing: string[] = [];
  const invalid: Array<{ component: string; reason: string }> = [];
  const dimensions: Record<string, number> = {};
  for (const component of components) {
    const effect = component.engineeringEffect;
    const label = `${component.category.name} / ${component.name}`;
    if (!effect) {
      missing.push(label);
      continue;
    }
    const parsed = partEngineeringEffectSchema.safeParse(effect);
    if (!parsed.success) {
      invalid.push({ component: label, reason: parsed.error.issues.map((issue) => issue.message).join("; ") });
      continue;
    }
    dimensions[effect.primaryDimension] = (dimensions[effect.primaryDimension] ?? 0) + 1;
  }
  console.log(JSON.stringify({
    activeComponents: components.length,
    mappedComponents: components.length - missing.length,
    validMappings: components.length - missing.length - invalid.length,
    missing,
    invalid,
    primaryDimensions: dimensions,
  }, null, 2));
}

main().catch((error) => {
  console.error("[audit-part-engineering-effects] Failed", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
