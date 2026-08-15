import { PrismaClient } from "@prisma/client";
import { applyApplicabilityOverride, evaluateUniversalPartApplicability } from "../lib/parts/universal-applicability";

const prisma = new PrismaClient();

async function main() {
  const makeSlug = readArgument("--make");
  const execute = process.argv.includes("--execute");
  if (!makeSlug) throw new Error("Usage: npm run map:parts-applicability -- --make=<slug> [--execute]");

  const make = await prisma.make.findUnique({
    where: { slug: makeSlug },
    select: {
      id: true,
      name: true,
      models: {
        select: {
          id: true,
          name: true,
          slug: true,
          productionStartYear: true,
          productionEndYear: true,
          bodyStyle: true,
          spec: { select: { engine: true, transmission: true, drivetrain: true } },
          _count: { select: { variants: true } },
        },
      },
    },
  });
  if (!make) throw new Error(`Make not found: ${makeSlug}`);

  const partTypes = await prisma.partComponentType.findMany({
    where: { active: true, category: { active: true } },
    select: { id: true, name: true, slug: true, fitmentRisk: true, category: { select: { slug: true } } },
  });
  const overrides = await prisma.partApplicabilityOverride.findMany({
    where: { vehicleMakeId: make.id, active: true },
    select: { vehicleModelId: true, partTypeId: true, overrideStatus: true, reason: true, source: true },
  });
  const overrideByScope = new Map(overrides.map((override) => [`${override.vehicleModelId || "*"}:${override.partTypeId}`, override]));
  const candidates = make.models.flatMap((model) => partTypes.map((partType) => {
    const override = (overrideByScope.get(`${model.id}:${partType.id}`) ?? overrideByScope.get(`*:${partType.id}`)) as Parameters<typeof applyApplicabilityOverride>[1];
    const evaluation = applyApplicabilityOverride(evaluateUniversalPartApplicability({
      id: partType.id,
      name: partType.name,
      slug: partType.slug,
      systemSlug: partType.category.slug,
      fitmentRisk: partType.fitmentRisk,
    }, {
      makeSlug,
      modelSlug: model.slug,
      modelName: model.name,
      productionStartYear: model.productionStartYear,
      productionEndYear: model.productionEndYear,
      engine: model.spec?.engine,
      transmission: model.spec?.transmission,
      drivetrain: model.spec?.drivetrain,
      bodyStyle: model.bodyStyle,
      variantCount: model._count.variants,
    }), override);
    return { model, partType, evaluation };
  }));

  const approved = candidates.filter((candidate) => candidate.evaluation.publiclyApplicable && !candidate.evaluation.reviewRequired);
  if (execute) {
    await prisma.modelPartComponent.createMany({
      data: approved.map((candidate) => ({
        modelId: candidate.model.id,
        componentTypeId: candidate.partType.id,
        applicability: candidate.evaluation.status,
        notes: `[UNIVERSAL_RULE] ${candidate.evaluation.reason}`,
        active: true,
      })),
      skipDuplicates: true,
    });
  }

  const statuses = Object.fromEntries(["APPLICABLE", "NOT_APPLICABLE", "VARIANT_DEPENDENT", "YEAR_DEPENDENT"].map((status) => [
    status,
    candidates.filter((candidate) => candidate.evaluation.status === status).length,
  ]));
  console.log(JSON.stringify({
    mode: execute ? "EXECUTE_APPROVED_ONLY" : "DRY_RUN",
    make: { id: make.id, name: make.name, slug: makeSlug },
    models: make.models.length,
    universalPartTypes: partTypes.length,
    candidates: candidates.length,
    statuses,
    approvedForPersistence: approved.length,
    reviewRequired: candidates.filter((candidate) => candidate.evaluation.reviewRequired).length,
    reviewSample: candidates.filter((candidate) => candidate.evaluation.reviewRequired).slice(0, 25).map((candidate) => ({
      model: candidate.model.name,
      system: candidate.partType.category.slug,
      partType: candidate.partType.name,
      status: candidate.evaluation.status,
      confidence: candidate.evaluation.confidence,
      reason: candidate.evaluation.reason,
    })),
  }, null, 2));
}

function readArgument(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim().toLowerCase();
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim().toLowerCase() : undefined;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
