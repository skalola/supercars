import type { Prisma, PrismaClient } from "@prisma/client";

const POPULAR_FERRARI_MODELS = [
  "458-italia",
  "488-gtb",
  "f8-tributo",
  "f430",
  "sf90-stradale",
  "812-superfast",
  "f12berlinetta",
];

export async function prepareZeroOfferRecovery(
  prisma: PrismaClient,
  options: { makeSlug: string; limit?: number; priorityModelSlugs?: string[] },
) {
  const limit = options.limit ?? 30;
  const priorityModelSlugs = options.priorityModelSlugs ?? [];
  await prisma.modelPartComponent.updateMany({
    where: {
      active: true,
      model: { make: { slug: options.makeSlug } },
      offerContexts: { none: { active: true, offer: { active: true } } },
      lastOfferSearchStatus: { in: ["COMPLETED", "PARTIAL", "NEVER"] },
    },
    data: { lastOfferSearchStatus: "ZERO_OFFERS" },
  });

  const recoveryWhere: Prisma.ModelPartComponentWhereInput = {
      active: true,
      model: { make: { slug: options.makeSlug } },
      offerContexts: { none: { active: true, offer: { active: true } } },
      lastOfferSearchStatus: { in: ["ZERO_OFFERS", "LOW_CONFIDENCE_ONLY", "SEARCH_EXHAUSTED", "API_ERROR"] },
  };
  const select = {
    id: true,
    lastOfferSearchStatus: true,
    lastOfferSearchAt: true,
    model: { select: { slug: true } },
    componentType: { select: { category: { select: { slug: true } } } },
  } satisfies Prisma.ModelPartComponentSelect;
  const [popular, oldest] = await Promise.all([
    prisma.modelPartComponent.findMany({
      where: {
        ...recoveryWhere,
        model: { make: { slug: options.makeSlug }, slug: { in: priorityModelSlugs } },
        componentType: { category: { slug: "maintenance-service" } },
      },
      select,
      orderBy: { lastOfferSearchAt: "asc" },
      take: Math.max(limit * 4, 50),
    }),
    prisma.modelPartComponent.findMany({
      where: recoveryWhere,
      select,
      orderBy: { lastOfferSearchAt: "asc" },
      take: Math.max(limit * 4, 50),
    }),
  ]);
  const queued = [...new Map([...popular, ...oldest].map((mapping) => [mapping.id, mapping])).values()];

  return queued
    .sort((left, right) => recoveryPriority(left, priorityModelSlugs) - recoveryPriority(right, priorityModelSlugs)
      || (left.lastOfferSearchAt?.getTime() ?? 0) - (right.lastOfferSearchAt?.getTime() ?? 0))
    .slice(0, limit)
    .map((mapping) => mapping.id);
}

export function prepareFerrariZeroOfferRecovery(prisma: PrismaClient, limit = 30) {
  return prepareZeroOfferRecovery(prisma, {
    makeSlug: "ferrari",
    limit,
    priorityModelSlugs: POPULAR_FERRARI_MODELS,
  });
}

function recoveryPriority(mapping: {
  lastOfferSearchStatus: string;
  model: { slug: string };
  componentType: { category: { slug: string } };
}, priorityModelSlugs: string[]) {
  let score = 100;
  if (priorityModelSlugs.includes(mapping.model.slug)) score -= 40;
  if (mapping.componentType.category.slug === "maintenance-service") score -= 30;
  if (mapping.lastOfferSearchStatus === "ZERO_OFFERS") score -= 10;
  if (mapping.lastOfferSearchStatus === "API_ERROR") score += 20;
  return score;
}
