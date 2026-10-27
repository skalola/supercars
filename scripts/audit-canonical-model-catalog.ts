import { prisma } from "@/lib/prisma";

async function main() {
  const strict = process.argv.includes("--strict");
  const makes = await prisma.make.findMany({
    select: {
      name: true,
      models: {
        select: {
          id: true, name: true, productionStartYear: true, productionEndYear: true, description: true,
          spec: { select: { engine: true, horsepower: true, torque: true, transmission: true, drivetrain: true, weight: true } },
          images: { where: { reviewStatus: { notIn: ["NEEDS_REVIEW", "REJECTED"] } }, select: { id: true }, take: 1 },
          catalogEvidence: { select: { reviewStatus: true }, take: 1 },
          maintenanceRules: { where: { reviewStatus: { not: "REJECTED" } }, select: { id: true }, take: 1 },
        },
      },
      maintenanceRules: { where: { reviewStatus: { not: "REJECTED" } }, select: { id: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  const totals = { models: 0, missingImages: 0, missingDescriptions: 0, missingCoreSpecs: 0, missingEvidence: 0, invalidYears: 0, missingSpecificMaintenance: 0 };
  for (const make of makes) {
    const row = { models: 0, missingImages: 0, missingDescriptions: 0, missingCoreSpecs: 0, missingEvidence: 0, invalidYears: 0, missingSpecificMaintenance: 0 };
    for (const model of make.models) {
      row.models += 1;
      if (!model.images.length) row.missingImages += 1;
      if (!model.description || model.description.trim().length < 40) row.missingDescriptions += 1;
      if (!model.spec?.engine || !model.spec.horsepower || !model.spec.torque || !model.spec.transmission || !model.spec.drivetrain || !model.spec.weight) row.missingCoreSpecs += 1;
      if (!model.catalogEvidence.length) row.missingEvidence += 1;
      if (model.productionStartYear && model.productionEndYear && model.productionStartYear > model.productionEndYear) row.invalidYears += 1;
      if (!model.maintenanceRules.length && !make.maintenanceRules.length) row.missingSpecificMaintenance += 1;
    }
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += row[key];
    console.log(`${make.name.padEnd(18)} models=${row.models.toString().padStart(4)} images_missing=${row.missingImages.toString().padStart(4)} specs_missing=${row.missingCoreSpecs.toString().padStart(4)} evidence_missing=${row.missingEvidence.toString().padStart(4)} maintenance_missing=${row.missingSpecificMaintenance.toString().padStart(4)}`);
  }
  console.log("\nCatalog totals");
  console.log(JSON.stringify(totals, null, 2));
  const hardFailures = totals.invalidYears;
  if (strict && hardFailures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[catalog-audit] Fatal error:", error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
