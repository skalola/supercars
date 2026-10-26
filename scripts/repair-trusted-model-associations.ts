import { prisma } from "@/lib/prisma";
import { MAKER_SITE_CONFIGS } from "@/lib/maker-sites/config";
import {
  canonicalEpaMakeName,
  fetchEpaVehicleRecords,
  normalizeMakeName,
} from "@/lib/model-catalog/sources/epa-fuel-economy";
import { trustedModelIdentity } from "@/lib/model-catalog/trusted-model-matcher";

async function main() {
  const apply = process.argv.includes("--apply");
  const makeNames = new Set(MAKER_SITE_CONFIGS.map((config) => normalizeMakeName(canonicalEpaMakeName(config.displayName))));
  const sourceRecords = await fetchEpaVehicleRecords(makeNames);
  const sourceById = new Map(sourceRecords.map((record) => [record.sourceId, record]));
  const profiles = await prisma.modelEngineeringProfile.findMany({
    where: { scope: "MODEL_YEAR_REPRESENTATIVE" },
    select: {
      id: true,
      model: {
        select: {
          id: true,
          name: true,
          metadataSource: true,
          make: { select: { name: true } },
          spec: true,
        },
      },
      evidence: {
        where: { sourceName: "U.S. EPA FuelEconomy.gov" },
        select: { sourceUrl: true },
        take: 1,
      },
    },
  });

  let mismatches = 0;
  for (const profile of profiles) {
    const sourceId = profile.evidence[0]?.sourceUrl?.match(/[?&]id=(\d+)/)?.[1];
    const source = sourceId ? sourceById.get(sourceId) : null;
    if (!source) continue;
    const modelIdentity = trustedModelIdentity(profile.model.name, profile.model.make.name);
    const sourceIdentity = trustedModelIdentity(source.baseModel, profile.model.make.name);
    if (modelIdentity === sourceIdentity) continue;
    mismatches += 1;
    console.log(`[trusted-model-repair] ${profile.model.make.name} ${profile.model.name} != EPA ${source.baseModel}`);
    if (!apply || profile.model.metadataSource === "U.S. EPA FuelEconomy.gov") continue;

    const spec = profile.model.spec;
    const derivedEngine = formatEngine(source);
    await prisma.$transaction([
      prisma.modelEngineeringProfile.delete({ where: { id: profile.id } }),
      ...(spec ? [prisma.modelSpec.update({
        where: { modelId: profile.model.id },
        data: {
          engine: spec.engine === derivedEngine ? null : undefined,
          displacement: spec.displacement === (source.displacementLiters ? `${source.displacementLiters.toFixed(1)} L` : null) ? null : undefined,
          cylinders: spec.cylinders === (source.cylinders ? String(source.cylinders) : null) ? null : undefined,
          transmission: spec.transmission === source.transmission ? null : undefined,
          drivetrain: spec.drivetrain === source.drivetrain ? null : undefined,
        },
      })] : []),
    ]);
  }

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "AUDIT ONLY", profiles: profiles.length, mismatches }, null, 2));
}

function formatEngine(record: { aspiration: string; displacementLiters: number | null; cylinders: number | null }) {
  const parts = [
    record.aspiration === "ELECTRIC" ? "Electric motor" : null,
    record.aspiration === "HYBRID" ? "Hybrid" : null,
    record.displacementLiters ? `${record.displacementLiters.toFixed(1)}L` : null,
    record.aspiration === "TURBOCHARGED" ? "Turbocharged" : record.aspiration === "SUPERCHARGED" ? "Supercharged" : record.aspiration === "TWIN_CHARGED" ? "Twin-charged" : null,
    record.cylinders ? ([6, 8, 10, 12].includes(record.cylinders) ? `V${record.cylinders}` : `${record.cylinders}-cylinder`) : null,
  ].filter(Boolean);
  return [...new Set(parts)].join(" ") || null;
}

main().catch((error) => {
  console.error("[trusted-model-repair] Failed", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
