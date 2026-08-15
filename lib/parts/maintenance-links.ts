import type { PrismaClient } from "@prisma/client";

export async function linkCanonicalPartToMaintenanceRule(
  prisma: PrismaClient,
  input: { maintenanceRuleId: string; partId: string; required?: boolean; notes?: string | null },
) {
  return prisma.maintenanceRulePart.upsert({
    where: {
      maintenanceRuleId_partId: {
        maintenanceRuleId: input.maintenanceRuleId,
        partId: input.partId,
      },
    },
    update: {
      required: input.required ?? false,
      notes: input.notes ?? null,
    },
    create: {
      maintenanceRuleId: input.maintenanceRuleId,
      partId: input.partId,
      required: input.required ?? false,
      notes: input.notes ?? null,
    },
  });
}

export async function getCanonicalPartsForMaintenanceRule(prisma: PrismaClient, maintenanceRuleId: string) {
  const now = new Date();
  return prisma.maintenanceRulePart.findMany({
    where: { maintenanceRuleId, part: { status: "ACTIVE" } },
    select: {
      required: true,
      notes: true,
      part: {
        select: {
          id: true,
          name: true,
          slug: true,
          oemPartNumber: true,
          category: { select: { name: true, slug: true } },
          brand: { select: { name: true, slug: true } },
          offers: {
            where: {
              active: true,
              affiliateUrl: { not: null },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: {
              id: true,
              provider: true,
              priceCents: true,
              currency: true,
              fitmentConfidence: true,
              expiresAt: true,
            },
            orderBy: [{ confidenceScore: "desc" }, { priceCents: "asc" }],
            take: 5,
          },
        },
      },
    },
    orderBy: [{ required: "desc" }, { createdAt: "asc" }],
  });
}

export async function linkPartTypeToMaintenanceRule(
  prisma: PrismaClient,
  input: { maintenanceRuleId: string; partTypeId: string; required?: boolean; notes?: string | null },
) {
  return prisma.maintenanceRulePart.upsert({
    where: {
      maintenanceRuleId_componentTypeId: {
        maintenanceRuleId: input.maintenanceRuleId,
        componentTypeId: input.partTypeId,
      },
    },
    update: {
      required: input.required ?? false,
      notes: input.notes ?? null,
    },
    create: {
      maintenanceRuleId: input.maintenanceRuleId,
      componentTypeId: input.partTypeId,
      required: input.required ?? false,
      notes: input.notes ?? null,
    },
  });
}

export async function getPartTypesForMaintenanceRule(prisma: PrismaClient, maintenanceRuleId: string) {
  return prisma.maintenanceRulePart.findMany({
    where: { maintenanceRuleId, componentType: { active: true } },
    select: {
      required: true,
      notes: true,
      componentType: {
        select: {
          id: true,
          name: true,
          slug: true,
          fitmentRisk: true,
          performanceRelated: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      },
    },
    orderBy: [{ required: "desc" }, { createdAt: "asc" }],
  });
}
