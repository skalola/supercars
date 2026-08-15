import { PrismaClient } from "@prisma/client";
import {
  FERRARI_COMPONENT_LIBRARY,
  getFerrariComponentSlug,
  normalizeFerrariComponent,
} from "../lib/parts/ferrari-component-library";
import {
  buildFerrariModelApplicabilityProfile,
  evaluateFerrariComponentApplicability,
  type FerrariApplicabilityStatus,
} from "../lib/parts/ferrari-applicability";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const [models, mappings] = await Promise.all([
    prisma.model.findMany({
      where: { make: { slug: "ferrari" } },
      select: {
        id: true,
        name: true,
        slug: true,
        productionStartYear: true,
        productionEndYear: true,
        category: true,
        bodyStyle: true,
        spec: { select: { engine: true, transmission: true, drivetrain: true } },
        variants: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.modelPartComponent.findMany({
      where: { model: { make: { slug: "ferrari" } } },
      select: {
        active: true,
        applicability: true,
        modelId: true,
        componentType: { select: { slug: true, category: { select: { slug: true } } } },
      },
    }),
  ]);
  const components = FERRARI_COMPONENT_LIBRARY.flatMap((system) => system.components.map((rawComponent) => ({
    system: system.slug,
    slug: getFerrariComponentSlug(rawComponent),
    component: normalizeFerrariComponent(rawComponent),
  })));
  const currentMappings = new Map(mappings.map((mapping) => [
    `${mapping.modelId}:${mapping.componentType.category.slug}:${mapping.componentType.slug}`,
    mapping,
  ]));
  const statusCounts: Record<FerrariApplicabilityStatus, number> = {
    APPLICABLE: 0,
    NOT_APPLICABLE: 0,
    YEAR_DEPENDENT: 0,
    VARIANT_DEPENDENT: 0,
  };
  const bySystem = new Map<string, Record<FerrariApplicabilityStatus, number>>();
  const missingPublicMappings: string[] = [];
  const overexposedMappings: string[] = [];
  const staleStatuses: string[] = [];

  for (const model of models) {
    for (const row of components) {
      const evaluation = evaluateFerrariComponentApplicability(row.component, {
        name: model.name,
        productionStartYear: model.productionStartYear,
        productionEndYear: model.productionEndYear,
        engine: model.spec?.engine ?? null,
        transmission: model.spec?.transmission ?? null,
        drivetrain: model.spec?.drivetrain ?? null,
        bodyStyle: model.bodyStyle,
        category: model.category,
        variantCount: model.variants.length,
      });
      statusCounts[evaluation.status] += 1;
      const systemCounts = bySystem.get(row.system) ?? { APPLICABLE: 0, NOT_APPLICABLE: 0, YEAR_DEPENDENT: 0, VARIANT_DEPENDENT: 0 };
      systemCounts[evaluation.status] += 1;
      bySystem.set(row.system, systemCounts);

      const key = `${model.id}:${row.system}:${row.slug}`;
      const current = currentMappings.get(key);
      if (evaluation.publiclyApplicable && !current?.active) missingPublicMappings.push(`${model.slug}:${row.system}:${row.slug}`);
      if (!evaluation.publiclyApplicable && current?.active) overexposedMappings.push(`${model.slug}:${row.system}:${row.slug}`);
      if (current && current.applicability !== evaluation.status) staleStatuses.push(`${model.slug}:${row.system}:${row.slug}:${current.applicability}->${evaluation.status}`);
    }
  }

  const modelProfiles = models.map((model) => ({
    model: model.name,
    slug: model.slug,
    profile: buildFerrariModelApplicabilityProfile({
      productionStartYear: model.productionStartYear,
      productionEndYear: model.productionEndYear,
      engine: model.spec?.engine ?? null,
      transmission: model.spec?.transmission ?? null,
      drivetrain: model.spec?.drivetrain ?? null,
      bodyStyle: model.bodyStyle,
      category: model.category,
    }),
  }));
  const incompleteProfiles = modelProfiles.filter((row) =>
    row.profile.aspiration === "UNKNOWN" || row.profile.electrification === "UNKNOWN" || row.profile.transmission === "UNKNOWN",
  );
  const passed = missingPublicMappings.length === 0 && overexposedMappings.length === 0 && staleStatuses.length === 0;
  console.log(JSON.stringify({
    passed,
    ferrariModels: models.length,
    componentTypes: components.length,
    evaluatedModelComponents: models.length * components.length,
    statusCounts,
    bySystem: [...bySystem].map(([system, counts]) => ({ system, ...counts })),
    modelDataCoverage: {
      completeProfiles: models.length - incompleteProfiles.length,
      incompleteProfiles: incompleteProfiles.length,
      incompleteModelSlugs: incompleteProfiles.map((row) => row.slug),
    },
    mappingDrift: {
      missingPublicMappings: missingPublicMappings.length,
      overexposedMappings: overexposedMappings.length,
      staleStatuses: staleStatuses.length,
      samples: {
        missingPublicMappings: missingPublicMappings.slice(0, 20),
        overexposedMappings: overexposedMappings.slice(0, 20),
        staleStatuses: staleStatuses.slice(0, 20),
      },
    },
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
