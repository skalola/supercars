import { PrismaClient } from "@prisma/client";
import {
  PART_CATALOG_TAXONOMY_SEEDS,
  PART_CATALOG_TAXONOMY_SOURCE,
  type PartCatalogNodeSeed,
} from "@/lib/parts/catalog-taxonomy";
import { getCatalogNodePlaceholderUrl } from "@/lib/parts/visual-placeholders";

const prisma = new PrismaClient();

type SeedStats = {
  created: number;
  existing: number;
  iconBackfilled: number;
  missingCategories: string[];
  byDepth: Record<number, number>;
};

function toPath(parentPath: string | null, slug: string) {
  return parentPath ? `${parentPath}/${slug}` : slug;
}

async function seedNode(
  node: PartCatalogNodeSeed,
  parentId: string | null,
  parentPath: string | null,
  depth: number,
  displayOrder: number,
  stats: SeedStats
) {
  const path = toPath(parentPath, node.slug);
  const category = node.categorySlug
    ? await prisma.partCategory.findUnique({ where: { slug: node.categorySlug } })
    : null;

  if (node.categorySlug && !category) {
    stats.missingCategories.push(`${path}: ${node.categorySlug}`);
  }

  const iconUrl = getCatalogNodePlaceholderUrl(node.slug, node.categorySlug);
  const existing = await prisma.partCatalogNode.findUnique({
    where: { path },
    select: { id: true, iconUrl: true },
  });

  const catalogNode = existing
    ? existing
    : await prisma.partCatalogNode.create({
        data: {
          name: node.name,
          slug: node.slug,
          path,
          description: node.description ?? null,
          iconUrl,
          depth,
          displayOrder,
          sourceName: PART_CATALOG_TAXONOMY_SOURCE.name,
          sourceUrl: PART_CATALOG_TAXONOMY_SOURCE.url,
          placeholderOnly: true,
          inventoryStatus: "SHELL_ONLY",
          active: true,
          categoryId: category?.id ?? null,
          parentId,
        },
        select: { id: true },
      });

  if (existing) {
    stats.existing += 1;
    if (!existing.iconUrl) {
      await prisma.partCatalogNode.update({
        where: { id: existing.id },
        data: { iconUrl },
      });
      stats.iconBackfilled += 1;
    }
  } else {
    stats.created += 1;
  }

  stats.byDepth[depth] = (stats.byDepth[depth] ?? 0) + 1;

  for (const [childIndex, child] of (node.children ?? []).entries()) {
    await seedNode(child, catalogNode.id, path, depth + 1, childIndex + 1, stats);
  }
}

async function main() {
  const stats: SeedStats = {
    created: 0,
    existing: 0,
    iconBackfilled: 0,
    missingCategories: [],
    byDepth: {},
  };

  for (const [index, node] of PART_CATALOG_TAXONOMY_SEEDS.entries()) {
    await seedNode(node, null, null, 0, index + 1, stats);
  }

  const [totalNodes, shellOnlyNodes, mappedParts] = await Promise.all([
    prisma.partCatalogNode.count(),
    prisma.partCatalogNode.count({ where: { inventoryStatus: "SHELL_ONLY" } }),
    prisma.performancePart.count({ where: { catalogNodeId: { not: null } } }),
  ]);

  console.log(JSON.stringify({
    created: stats.created,
    existing: stats.existing,
    iconBackfilled: stats.iconBackfilled,
    totalNodes,
    shellOnlyNodes,
    mappedParts,
    byDepth: stats.byDepth,
    missingCategories: Array.from(new Set(stats.missingCategories)),
    note: "Seeded catalog taxonomy placeholders only. No PerformancePart inventory rows were created or overwritten.",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
