import { prisma } from "@/lib/prisma";
import { partEngineeringEffectSchema } from "./part-effects";

export async function getPartEngineeringEffect(componentTypeId: string) {
  const row = await prisma.partEngineeringEffect.findUnique({
    where: { componentTypeId },
    select: {
      componentTypeId: true,
      primaryDimension: true,
      benefits: true,
      tradeoffs: true,
      dependencies: true,
      risks: true,
      buildIntentions: true,
      confidence: true,
      evidenceBasis: true,
      contractVersion: true,
      reviewStatus: true,
      active: true,
    },
  });
  if (!row?.active) return null;

  const definition = partEngineeringEffectSchema.parse({
    contractVersion: row.contractVersion,
    primaryDimension: row.primaryDimension,
    benefits: row.benefits,
    tradeoffs: row.tradeoffs,
    dependencies: row.dependencies,
    risks: row.risks,
    buildIntentions: row.buildIntentions,
    confidence: row.confidence,
    evidenceBasis: row.evidenceBasis,
  });
  return { componentTypeId: row.componentTypeId, reviewStatus: row.reviewStatus, ...definition };
}
