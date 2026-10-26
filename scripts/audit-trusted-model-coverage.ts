import { prisma } from "@/lib/prisma";
import { MAKER_SITE_CONFIGS } from "@/lib/maker-sites/config";

async function main() {
  const slugs = MAKER_SITE_CONFIGS.map((config) => config.slug);
  const models = await prisma.model.findMany({
    where: { make: { slug: { in: slugs } } },
    select: {
      spec: {
        select: {
          engine: true,
          displacement: true,
          cylinders: true,
          horsepower: true,
          torque: true,
          transmission: true,
          drivetrain: true,
          topSpeed: true,
          zeroToSixty: true,
          weight: true,
        },
      },
      engineeringProfiles: {
        where: { scope: "MODEL_YEAR_REPRESENTATIVE" },
        select: { id: true },
        take: 1,
      },
    },
  });
  const fields = [
    "engine",
    "displacement",
    "cylinders",
    "horsepower",
    "torque",
    "transmission",
    "drivetrain",
    "topSpeed",
    "zeroToSixty",
    "weight",
  ] as const;
  const coverage = Object.fromEntries(fields.map((field) => [
    field,
    models.filter((model) => Boolean(model.spec?.[field])).length,
  ]));
  console.log(JSON.stringify({
    configuredMakes: slugs.length,
    models: models.length,
    withSpecs: models.filter((model) => model.spec).length,
    withTrustedEpaProfile: models.filter((model) => model.engineeringProfiles.length > 0).length,
    coverage,
  }, null, 2));
}

main().catch((error) => {
  console.error("[trusted-model-coverage] Failed", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
