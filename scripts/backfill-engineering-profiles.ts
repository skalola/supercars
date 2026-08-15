import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  classifyEngineeringAspiration,
  classifyEngineeringDrivetrain,
  classifyEngineeringTransmission,
  normalizeHorsepower,
  normalizeTorqueLbFt,
  normalizeWeightLb,
} from "@/lib/parts/engineering-normalization";
import { resolveVinEngineeringConsensus, type VinEngineeringConsensus } from "@/lib/parts/vin-engineering-consensus";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");

async function main() {
  const models = await prisma.model.findMany({
    where: {
      OR: [
        { partComponents: { some: { active: true } } },
        { partCompatibility: { some: { part: { status: "ACTIVE" } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      productionStartYear: true,
      productionEndYear: true,
      make: { select: { name: true } },
      spec: true,
      vehicles: {
        where: { vinIdentityStatus: "VALID" },
        select: { year: true, engine: true, engineHP: true, transmission: true, drivetrain: true, turbo: true, fuelType: true },
        take: 100,
      },
      variants: { select: { id: true, name: true, productionStartYear: true, productionEndYear: true } },
      engineeringProfiles: true,
    },
    orderBy: [{ make: { name: "asc" } }, { name: "asc" }],
  });

  const report = { mode: execute ? "execute" : "dry-run", models: models.length, variants: 0, profilesCreated: 0, profilesUpdated: 0, evidenceCreated: 0, vinEvidenceCreated: 0, fieldUpdates: {} as Record<string, number> };
  for (const model of models) {
    const baseKey = `${model.id}:base`;
    const vinConsensus = resolveVinEngineeringConsensus(model.vehicles, {
      start: model.productionStartYear,
      end: model.productionEndYear,
    });
    const modelAspiration = classifyEngineeringAspiration(model.spec?.engine);
    const modelDrivetrain = classifyEngineeringDrivetrain(model.spec?.drivetrain);
    const modelTransmission = classifyEngineeringTransmission(model.spec?.transmission);
    const candidate = {
      yearStart: model.productionStartYear,
      yearEnd: model.productionEndYear,
      engineCode: promotable(vinConsensus.engineCode)?.value ?? null,
      engineDescription: model.spec?.engine ?? null,
      aspiration: modelAspiration !== "UNKNOWN" ? modelAspiration : promotable(vinConsensus.aspiration)?.value ?? "UNKNOWN",
      drivetrain: modelDrivetrain !== "UNKNOWN" ? modelDrivetrain : promotable(vinConsensus.drivetrain)?.value ?? "UNKNOWN",
      transmissionType: modelTransmission !== "UNKNOWN" ? modelTransmission : promotable(vinConsensus.transmissionType)?.value ?? "UNKNOWN",
      transmissionDescription: model.spec?.transmission ?? promotable(vinConsensus.transmissionDescription)?.value ?? null,
      horsepower: normalizeHorsepower(model.spec?.horsepower) ?? promotable(vinConsensus.horsepower)?.value ?? null,
      torqueLbFt: normalizeTorqueLbFt(model.spec?.torque),
      weightLb: normalizeWeightLb(model.spec?.weight),
    };
    const existingBase = model.engineeringProfiles.find((profile) => profile.profileKey === baseKey);
    const pendingBaseUpdate = existingBase ? missingProfileValues(existingBase, candidate) : {};
    countFields(report.fieldUpdates, pendingBaseUpdate);
    if (execute) {
      const profile = await prisma.modelEngineeringProfile.upsert({
        where: { profileKey: baseKey },
        create: {
          profileKey: baseKey,
          modelId: model.id,
          scope: "MODEL",
          confidence: "LOW",
          reviewStatus: "NEEDS_REVIEW",
          ...candidate,
        },
        update: pendingBaseUpdate,
      });
      if (!existingBase) report.profilesCreated += 1;
      else if (Object.keys(pendingBaseUpdate).length > 0) report.profilesUpdated += 1;
      report.evidenceCreated += await persistLegacyEvidence(profile.id, model, candidate);
      report.vinEvidenceCreated += await persistVinEvidence(profile, vinConsensus);
    } else if (existingBase) {
      if (Object.keys(pendingBaseUpdate).length > 0) report.profilesUpdated += 1;
    }
    else report.profilesCreated += 1;

    for (const variant of model.variants) {
      report.variants += 1;
      const variantKey = `${model.id}:variant:${variant.id}`;
      const existingVariant = model.engineeringProfiles.find((profile) => profile.profileKey === variantKey);
      const pendingVariantUpdate = existingVariant ? missingProfileValues(existingVariant, {
        yearStart: variant.productionStartYear,
        yearEnd: variant.productionEndYear,
      }) : {};
      countFields(report.fieldUpdates, pendingVariantUpdate);
      if (execute) {
        await prisma.modelEngineeringProfile.upsert({
          where: { profileKey: variantKey },
          create: {
            profileKey: variantKey,
            modelId: model.id,
            variantId: variant.id,
            scope: "VARIANT",
            yearStart: variant.productionStartYear,
            yearEnd: variant.productionEndYear,
            confidence: "UNKNOWN",
            reviewStatus: "NEEDS_REVIEW",
          },
          update: pendingVariantUpdate,
        });
        if (existingVariant && Object.keys(pendingVariantUpdate).length > 0) report.profilesUpdated += 1;
        else if (!existingVariant) report.profilesCreated += 1;
      } else if (existingVariant) {
        if (Object.keys(pendingVariantUpdate).length > 0) report.profilesUpdated += 1;
      } else {
        report.profilesCreated += 1;
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

async function persistLegacyEvidence(
  profileId: string,
  model: { id: string; spec: { engine: string | null; horsepower: string | null; torque: string | null; weight: string | null; drivetrain: string | null; transmission: string | null } | null },
  candidate: Record<string, unknown>,
) {
  const sourceFields = [
    ["engineDescription", model.spec?.engine],
    ["horsepower", model.spec?.horsepower],
    ["torqueLbFt", model.spec?.torque],
    ["weightLb", model.spec?.weight],
    ["drivetrain", model.spec?.drivetrain],
    ["transmissionType", model.spec?.transmission],
  ] as const;
  let created = 0;
  for (const [fieldName, rawValue] of sourceFields) {
    if (!rawValue || candidate[fieldName] === null || candidate[fieldName] === "UNKNOWN") continue;
    const evidenceKey = hash(`${profileId}:${fieldName}:legacy-model-spec`);
    const prior = await prisma.modelEngineeringEvidence.findUnique({ where: { evidenceKey }, select: { id: true } });
    await prisma.modelEngineeringEvidence.upsert({
      where: { evidenceKey },
      create: {
        evidenceKey,
        profileId,
        fieldName,
        sourceType: "TRUSTED_REFERENCE",
        sourceName: "Existing ModelSpec catalog",
        rawValue,
        confidence: "LOW",
        notes: "Migrated from the existing source-backed model catalog; field-level source attribution requires enrichment.",
      },
      update: { rawValue },
    });
    if (!prior) created += 1;
  }
  return created;
}

async function persistVinEvidence(
  profile: Awaited<ReturnType<typeof prisma.modelEngineeringProfile.findUniqueOrThrow>>,
  consensus: VinEngineeringConsensus,
) {
  const fields = [
    ["engineCode", consensus.engineCode],
    ["horsepower", consensus.horsepower],
    ["aspiration", consensus.aspiration],
    ["drivetrain", consensus.drivetrain],
    ["transmissionType", consensus.transmissionType],
    ["transmissionDescription", consensus.transmissionDescription],
  ] as const;
  let created = 0;
  for (const [fieldName, evidence] of fields) {
    if (!evidence || profile[fieldName] !== evidence.value) continue;
    const evidenceKey = hash(`${profile.id}:${fieldName}:nhtsa-vin-consensus-v1`);
    const prior = await prisma.modelEngineeringEvidence.findUnique({ where: { evidenceKey }, select: { id: true } });
    await prisma.modelEngineeringEvidence.upsert({
      where: { evidenceKey },
      create: {
        evidenceKey,
        profileId: profile.id,
        fieldName,
        sourceType: "REGULATORY_VIN_DECODE",
        sourceName: "NHTSA vPIC VIN decode consensus",
        rawValue: evidence.rawValue,
        confidence: evidence.confidence,
        notes: `Consensus across ${evidence.supportingRecords} valid VIN-backed vehicle record${evidence.supportingRecords === 1 ? "" : "s"}.`,
      },
      update: {
        rawValue: evidence.rawValue,
        confidence: evidence.confidence,
        notes: `Consensus across ${evidence.supportingRecords} valid VIN-backed vehicle record${evidence.supportingRecords === 1 ? "" : "s"}.`,
      },
    });
    if (!prior) created += 1;
  }
  return created;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function missingProfileValues(
  existing: object,
  candidate: Record<string, unknown>,
) {
  const currentValues = existing as Record<string, unknown>;
  return Object.fromEntries(Object.entries(candidate).filter(([field, value]) => {
    const current = currentValues[field];
    return value !== null && value !== undefined && value !== "UNKNOWN"
      && (current === null || current === undefined || current === "" || current === "UNKNOWN");
  }));
}

function countFields(counts: Record<string, number>, values: Record<string, unknown>) {
  for (const field of Object.keys(values)) counts[field] = (counts[field] ?? 0) + 1;
}

function promotable<T extends { confidence: string }>(evidence: T | null) {
  return evidence?.confidence === "MEDIUM" || evidence?.confidence === "HIGH" || evidence?.confidence === "VERIFIED" ? evidence : null;
}

main().catch((error) => {
  console.error("[backfill-engineering-profiles] Failed", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
