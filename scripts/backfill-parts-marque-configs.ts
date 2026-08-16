import { PrismaClient } from "@prisma/client";
import { ensurePartsMarqueConfig } from "../lib/parts/marque-config";

const prisma = new PrismaClient();

async function main() {
  const execute = process.argv.includes("--execute");
  const makes = await prisma.make.findMany({
    where: { models: { some: {} } },
    select: {
      id: true,
      name: true,
      slug: true,
      partsMarqueConfig: { select: { partsEnabled: true, enabledProviders: true } },
      _count: { select: { models: true } },
    },
    orderBy: { name: "asc" },
  });
  const pending = makes.filter((make) => !make.partsMarqueConfig?.partsEnabled);

  if (execute) {
    for (const make of pending) await ensurePartsMarqueConfig(prisma, make.id);
  }

  console.log(JSON.stringify({
    mode: execute ? "EXECUTE" : "DRY_RUN",
    makesWithModels: makes.length,
    alreadyEnabled: makes.length - pending.length,
    enabled: execute ? pending.length : 0,
    pending: execute ? 0 : pending.length,
    makes: pending.map((make) => ({ name: make.name, slug: make.slug, models: make._count.models })),
    note: "All catalog makes use the shared on-demand discovery pipeline. Exact applicability overrides remain authoritative.",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
