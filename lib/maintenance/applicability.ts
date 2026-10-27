import type { MaintenanceRule, Prisma, PrismaClient } from "@prisma/client";

export type MaintenanceContext = {
  makeId: string;
  modelId: string;
  variantId?: string | null;
  year?: number | null;
  powertrainType?: string | null;
};

export function applicableMaintenanceWhere(context: MaintenanceContext): Prisma.MaintenanceRuleWhereInput {
  const scope: Prisma.MaintenanceRuleWhereInput[] = [
    { scope: "UNIVERSAL", makeId: null, modelId: null, variantId: null },
    { scope: "MAKE", makeId: context.makeId, modelId: null, variantId: null },
    { scope: "MODEL", modelId: context.modelId, variantId: null },
  ];
  if (context.variantId) scope.push({ scope: "VARIANT", variantId: context.variantId });
  if (context.powertrainType) {
    scope.push({
      scope: "POWERTRAIN",
      makeId: context.makeId,
      powertrainType: context.powertrainType,
      modelId: null,
      variantId: null,
    });
  }

  return {
    reviewStatus: { not: "REJECTED" },
    AND: [
      { OR: scope },
      context.year ? { OR: [{ yearStart: null }, { yearStart: { lte: context.year } }] } : {},
      context.year ? { OR: [{ yearEnd: null }, { yearEnd: { gte: context.year } }] } : {},
    ],
  };
}

export async function getApplicableMaintenanceRules<T extends Prisma.MaintenanceRuleSelect>(
  client: PrismaClient,
  context: MaintenanceContext,
  select: T,
  take = 12,
) {
  const rows = await client.maintenanceRule.findMany({
    where: applicableMaintenanceWhere(context),
    select,
    orderBy: [{ priority: "asc" }, { intervalMiles: "asc" }, { intervalMonths: "asc" }],
  });
  return dedupeMaintenanceRules(rows as Array<MaintenanceRule & Record<string, unknown>>).slice(0, take) as Prisma.MaintenanceRuleGetPayload<{ select: T }>[];
}

export function dedupeMaintenanceRules<T extends Pick<MaintenanceRule, "category" | "serviceName" | "scope" | "confidence">>(rules: T[]) {
  const result = new Map<string, T>();
  for (const rule of [...rules].sort((a, b) => score(b) - score(a))) {
    const key = `${rule.category}:${rule.serviceName}`.toLowerCase();
    if (!result.has(key)) result.set(key, rule);
  }
  return [...result.values()];
}

function score(rule: Pick<MaintenanceRule, "scope" | "confidence">) {
  const scope = { VARIANT: 50, MODEL: 40, POWERTRAIN: 30, MAKE: 20, UNIVERSAL: 10 }[rule.scope] ?? 0;
  const confidence = { SOURCE_VERIFIED: 4, HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[rule.confidence] ?? 0;
  return scope + confidence;
}
