import { PrismaClient } from "@prisma/client";
import {
  fillMissingModelSpec,
  resolveVinDecodedModelSpec,
  type CanonicalModelSpec,
} from "@/lib/model-catalog/model-specs";
import { fetchGt7ModelSpecs, modelSpecMatchKey } from "@/lib/model-catalog/sources/gt7-specs";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");

async function main() {
  const [models, gt7Rows] = await Promise.all([
    prisma.model.findMany({
      where: {
        OR: [
          { partComponents: { some: { active: true } } },
          { partCompatibility: { some: { part: { status: "ACTIVE" } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        make: { select: { name: true } },
        spec: true,
        vehicles: {
          where: { vinIdentityStatus: "VALID" },
          select: {
            engine: true,
            displacement: true,
            engineCylinders: true,
            engineHP: true,
            transmission: true,
            drivetrain: true,
          },
          take: 100,
        },
      },
      orderBy: [{ make: { name: "asc" } }, { name: "asc" }],
    }),
    fetchGt7ModelSpecs(),
  ]);

  const gt7ByModel = new Map(gt7Rows.map((row) => [modelSpecMatchKey(row.makeName, row.modelName), row]));
  const report = {
    mode: execute ? "execute" : "dry-run",
    scannedModels: models.length,
    changedModels: 0,
    fieldsFilled: 0,
    fromGt7: 0,
    fromVinDecode: 0,
    unchangedModels: 0,
  };

  for (const model of models) {
    const gt7 = gt7ByModel.get(modelSpecMatchKey(model.make.name, model.name));
    const gt7Spec: Partial<CanonicalModelSpec> = gt7 ? {
      displacement: gt7.displacement,
      horsepower: gt7.horsepower,
      torque: gt7.torque,
      drivetrain: gt7.drivetrain,
      weight: gt7.weight,
    } : {};
    const vinSpec = resolveVinDecodedModelSpec(model.vehicles);
    const { resolved, filledFields } = fillMissingModelSpec(model.spec, [gt7Spec, vinSpec]);

    if (filledFields.length === 0) {
      report.unchangedModels += 1;
      continue;
    }

    report.changedModels += 1;
    report.fieldsFilled += filledFields.length;
    report.fromGt7 += filledFields.filter((field) => Boolean(gt7Spec[field])).length;
    report.fromVinDecode += filledFields.filter((field) => !gt7Spec[field] && Boolean(vinSpec[field])).length;

    console.log(`${execute ? "UPDATE" : "WOULD UPDATE"} ${model.make.name} ${model.name}: ${filledFields.join(", ")}`);
    if (!execute) continue;

    await prisma.modelSpec.upsert({
      where: { modelId: model.id },
      create: { modelId: model.id, ...resolved },
      update: Object.fromEntries(filledFields.map((field) => [field, resolved[field]])),
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error("[backfill-parts-model-specs] Failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
