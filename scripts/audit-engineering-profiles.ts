import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const models = await prisma.model.findMany({
    where: {
      OR: [
        { partComponents: { some: { active: true } } },
        { partCompatibility: { some: { part: { status: "ACTIVE" } } } },
      ],
    },
    select: {
      name: true,
      make: { select: { name: true } },
      variants: { select: { id: true, name: true } },
      engineeringProfiles: true,
    },
    orderBy: [{ make: { name: "asc" } }, { name: "asc" }],
  });

  const fields = ["engineCode", "horsepower", "torqueLbFt", "weightLb", "drivetrain", "transmissionType", "tires", "brakes", "thermal"] as const;
  const rows = models.flatMap((model) => {
    const expected = [{ id: null, name: "Base model" }, ...model.variants];
    return expected.map((variant) => {
      const profile = model.engineeringProfiles.find((item) => variant.id ? item.variantId === variant.id : item.scope === "MODEL");
      const missing = fields.filter((field) => isMissing(profile, field));
      return { make: model.make.name, model: model.name, variant: variant.name, profileId: profile?.id ?? null, missing };
    });
  });
  const incomplete = rows.filter((row) => row.missing.length > 0);
  console.log(JSON.stringify({
    models: models.length,
    expectedProfiles: rows.length,
    storedProfiles: rows.filter((row) => row.profileId).length,
    completeProfiles: rows.length - incomplete.length,
    profilesNeedingReview: incomplete.length,
    missingCounts: Object.fromEntries(fields.map((field) => [field, rows.filter((row) => row.missing.includes(field)).length])),
    incomplete,
  }, null, 2));
}

function isMissing(profile: Awaited<ReturnType<typeof prisma.modelEngineeringProfile.findFirst>> | undefined, field: string) {
  if (!profile) return true;
  if (field === "tires") return ![profile.frontTireWidthMm, profile.rearTireWidthMm, profile.frontWheelDiameterIn, profile.rearWheelDiameterIn].some(Boolean);
  if (field === "brakes") return ![profile.frontRotorDiameterMm, profile.rearRotorDiameterMm, profile.frontBrakePistonCount, profile.rearBrakePistonCount].some(Boolean);
  if (field === "thermal") return ![profile.oilCooling, profile.chargeCooling, profile.transmissionCooling, profile.brakeCooling].some(Boolean) && profile.sustainedUseRating === "UNKNOWN";
  const value = profile[field as keyof typeof profile];
  return value === null || value === undefined || value === "" || value === "UNKNOWN";
}

main().catch((error) => {
  console.error("[audit-engineering-profiles] Failed", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
