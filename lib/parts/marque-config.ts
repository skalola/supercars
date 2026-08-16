import type { PrismaClient } from "@prisma/client";

const DEFAULT_PART_OFFER_PROVIDERS = ["EBAY"];

export async function ensurePartsMarqueConfig(prisma: PrismaClient, makeId: string) {
  return prisma.partsMarqueConfig.upsert({
    where: { makeId },
    update: {
      partsEnabled: true,
      catalogStatus: "ON_DEMAND",
    },
    create: {
      makeId,
      partsEnabled: true,
      catalogStatus: "ON_DEMAND",
      defaultCurrency: "USD",
      defaultMarketplace: "EBAY_US",
      enabledProviders: DEFAULT_PART_OFFER_PROVIDERS,
      enabledAt: new Date(),
    },
    select: {
      partsEnabled: true,
      catalogStatus: true,
      enabledProviders: true,
    },
  });
}
