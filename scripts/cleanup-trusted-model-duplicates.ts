import { prisma } from "@/lib/prisma";
import { trustedModelIdentity } from "@/lib/model-catalog/trusted-model-matcher";

const EPA_SOURCE = "U.S. EPA FuelEconomy.gov";

async function main() {
  const apply = process.argv.includes("--apply");
  const models = await prisma.model.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      metadataSource: true,
      make: { select: { name: true } },
      _count: {
        select: {
          vehicles: true,
          listings: true,
          garageItems: true,
          carClubs: true,
          maintenanceRules: true,
          marketSales: true,
          marketSnapshots: true,
          partCompatibility: true,
          partComponents: true,
          partCatalogReferences: true,
          partPerformanceConfigurations: true,
          preferredPartBrands: true,
          partApplicabilityOverrides: true,
          providerVehicleMappings: true,
        },
      },
    },
  });
  const groups = new Map<string, typeof models>();
  for (const model of models) {
    const identity = trustedModelIdentity(model.name, model.make.name);
    const key = `${model.make.name}:${identity}`;
    const group = groups.get(key) || [];
    group.push(model);
    groups.set(key, group);
  }

  let duplicateGroups = 0;
  let deleted = 0;
  let protectedRows = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    duplicateGroups += 1;
    const keeper = [...group].sort((a, b) => {
      const aEpa = a.metadataSource === EPA_SOURCE ? 1 : 0;
      const bEpa = b.metadataSource === EPA_SOURCE ? 1 : 0;
      const aSuffix = /-\d+$/.test(a.slug) ? 1 : 0;
      const bSuffix = /-\d+$/.test(b.slug) ? 1 : 0;
      return aEpa - bEpa || aSuffix - bSuffix || a.slug.length - b.slug.length;
    })[0];

    for (const duplicate of group.filter((model) => model.id !== keeper.id)) {
      const connected = Object.values(duplicate._count).some((count) => count > 0);
      if (duplicate.metadataSource !== EPA_SOURCE || connected) {
        protectedRows += 1;
        console.log(`[model-dedupe] Protected ${duplicate.make.name} ${duplicate.name} (${duplicate.slug}); keeper ${keeper.slug}.`);
        continue;
      }
      console.log(`[model-dedupe] ${apply ? "Deleting" : "Would delete"} ${duplicate.make.name} ${duplicate.name} (${duplicate.slug}); keeper ${keeper.slug}.`);
      deleted += 1;
      if (!apply) continue;
      await prisma.$transaction([
        prisma.modelImage.deleteMany({ where: { modelId: duplicate.id } }),
        prisma.modelImageCandidate.updateMany({ where: { modelId: duplicate.id }, data: { modelId: null } }),
        prisma.modelImageCandidate.updateMany({ where: { matchedModelId: duplicate.id }, data: { matchedModelId: null } }),
        prisma.modelEngineeringProfile.deleteMany({ where: { modelId: duplicate.id } }),
        prisma.modelVariant.deleteMany({ where: { modelId: duplicate.id } }),
        prisma.modelSpec.deleteMany({ where: { modelId: duplicate.id } }),
        prisma.model.delete({ where: { id: duplicate.id } }),
      ]);
    }
  }
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "AUDIT ONLY", duplicateGroups, deleted, protectedRows }, null, 2));
}

main().catch((error) => {
  console.error("[model-dedupe] Failed", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
