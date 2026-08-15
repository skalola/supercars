import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const makeSlug = readArgument("--make") || "ferrari";
  const make = await prisma.make.findUnique({
    where: { slug: makeSlug },
    select: { id: true, name: true, partsMarqueConfig: { select: { partsEnabled: true, catalogStatus: true, enabledProviders: true } } },
  });
  if (!make) throw new Error(`Make not found: ${makeSlug}`);
  const now = new Date();
  const enabledProviderCodes = Array.isArray(make.partsMarqueConfig?.enabledProviders)
    ? make.partsMarqueConfig.enabledProviders.filter((code): code is string => typeof code === "string")
    : [];
  const [models, mappedModels, systems, partTypes, mappings, preferredBrands, providers, offerContexts, affiliateContexts] = await Promise.all([
    prisma.model.count({ where: { makeId: make.id } }),
    prisma.model.count({ where: { makeId: make.id, partComponents: { some: { active: true } } } }),
    prisma.partCategory.count({ where: { componentTypes: { some: { modelMappings: { some: { active: true, model: { makeId: make.id } } } } } } }),
    prisma.partComponentType.count({ where: { modelMappings: { some: { active: true, model: { makeId: make.id } } } } }),
    prisma.modelPartComponent.count({ where: { active: true, model: { makeId: make.id } } }),
    prisma.preferredPartBrand.count({ where: { active: true, vehicleMakeId: make.id } }),
    prisma.partOfferProvider.count({ where: { active: true, code: { in: enabledProviderCodes } } }),
    prisma.partOfferContext.count({ where: { active: true, modelPartComponent: { model: { makeId: make.id } }, offer: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } }),
    prisma.partOfferContext.count({ where: { active: true, modelPartComponent: { model: { makeId: make.id } }, offer: { active: true, affiliateUrl: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } }),
  ]);
  const checks = {
    modelsMapped: models > 0 && mappedModels === models,
    systemsMapped: systems > 0,
    partTypesMapped: partTypes > 0,
    preferredBrandsConfigured: preferredBrands > 0,
    supplierProviderAvailable: providers > 0,
    offerQueriesTested: offerContexts > 0,
    affiliateUrlsVerified: offerContexts > 0 && affiliateContexts === offerContexts,
  };
  console.log(JSON.stringify({
    make: { ...make, slug: makeSlug },
    counts: { models, mappedModels, systems, partTypes, mappings, preferredBrands, providers, liveOfferContexts: offerContexts },
    checks,
    configuredState: make.partsMarqueConfig,
    readyToEnable: Object.values(checks).every(Boolean),
    publiclyEnabled: make.partsMarqueConfig?.partsEnabled ?? false,
  }, null, 2));
}

function readArgument(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1).trim().toLowerCase() : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
