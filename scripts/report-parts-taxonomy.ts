import { PrismaClient } from "@prisma/client";
import {
  AUTOMOTIVE_PART_SYSTEMS,
  getFerrariComponentMigrationMap,
} from "../lib/parts/ferrari-component-library";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const migrationMap = getFerrariComponentMigrationMap();
  const [systems, ferrariMappings, latestMigration] = await Promise.all([
    prisma.partCategory.findMany({
      where: { slug: { in: AUTOMOTIVE_PART_SYSTEMS.map((system) => system.slug) }, active: true },
      select: {
        name: true,
        slug: true,
        componentTypes: {
          where: { active: true },
          select: { id: true, systemGroup: true },
        },
      },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.modelPartComponent.count({ where: { active: true, model: { make: { slug: "ferrari" } } } }),
    prisma.partSourceRun.findFirst({
      where: { runType: "AUTOMOTIVE_TAXONOMY_MIGRATION", status: "COMPLETED" },
      select: { completedAt: true, stats: true },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  const targetKeys = migrationMap.map((row) => `${row.newCategory}:${row.newSlug}`);
  const migrationRoutes = Array.from(migrationMap.reduce((routes, row) => {
    const route = `${row.oldCategory} -> ${row.newCategory}`;
    routes.set(route, (routes.get(route) ?? 0) + 1);
    return routes;
  }, new Map<string, number>())).map(([route, components]) => ({ route, components }));
  console.log(JSON.stringify({
    topLevelSystemCount: systems.length,
    topLevelSystems: systems.map((system) => ({
      name: system.name,
      slug: system.slug,
      subcategories: [...new Set(system.componentTypes.map((component) => component.systemGroup).filter(Boolean))].sort(),
      canonicalComponents: system.componentTypes.length,
    })),
    subcategoryCount: new Set(systems.flatMap((system) => system.componentTypes.map((component) => `${system.slug}:${component.systemGroup}`))).size,
    canonicalComponentCount: systems.reduce((total, system) => total + system.componentTypes.length, 0),
    sourceComponentDefinitionsMigrated: migrationMap.length,
    duplicateComponentsDetected: targetKeys.length - new Set(targetKeys).size,
    canonicalTargetsFromMigration: new Set(targetKeys).size,
    migrationRoutes,
    ferrariModelComponentMappings: ferrariMappings,
    latestMigration,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
