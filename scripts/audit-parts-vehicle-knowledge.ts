import { PrismaClient } from "@prisma/client";
import { selectModelHeroImage } from "@/lib/model-catalog/model-display";

const prisma = new PrismaClient();

const REQUIRED_SPEC_FIELDS = [
  "engine",
  "horsepower",
  "torque",
  "weight",
  "drivetrain",
  "transmission",
] as const;

async function main() {
  const models = await prisma.model.findMany({
    where: {
      OR: [
        { partComponents: { some: { active: true } } },
        {
          partCompatibility: {
            some: {
              part: {
                status: "ACTIVE",
                sourceUrl: { not: null },
                sourceConfidence: "SOURCE_VERIFIED",
                imageUrl: { not: null },
              },
            },
          },
        },
      ],
    },
    select: {
      name: true,
      slug: true,
      productionStartYear: true,
      productionEndYear: true,
      make: { select: { name: true, slug: true, logoUrl: true } },
      spec: {
        select: {
          engine: true,
          horsepower: true,
          torque: true,
          weight: true,
          drivetrain: true,
          transmission: true,
        },
      },
      images: {
        select: { url: true, type: true, reviewStatus: true },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
        take: 12,
      },
    },
    orderBy: [{ make: { name: "asc" } }, { name: "asc" }],
  });

  const rows = models.map((model) => {
    const missing = [
      !model.make.logoUrl ? "makeLogo" : null,
      !selectModelHeroImage(model.images) ? "heroImage" : null,
      !model.productionStartYear && !model.productionEndYear ? "year" : null,
      ...REQUIRED_SPEC_FIELDS.map((field) => !model.spec?.[field] ? field : null),
    ].filter((field): field is string => Boolean(field));

    return {
      make: model.make.name,
      model: model.name,
      slug: model.slug,
      missing,
    };
  });

  const incomplete = rows.filter((row) => row.missing.length > 0);
  const missingFields = ["makeLogo", "heroImage", "year", ...REQUIRED_SPEC_FIELDS];
  console.log(JSON.stringify({
    totalModels: rows.length,
    completeModels: rows.length - incomplete.length,
    incompleteModels: incomplete.length,
    missingCounts: Object.fromEntries(
      missingFields.map((field) => [field, incomplete.filter((row) => row.missing.includes(field)).length]),
    ),
    incomplete,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("[parts-vehicle-knowledge] Audit failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
