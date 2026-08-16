import type { PartOfferProviderAdapter } from "@/lib/parts/offers/provider";

export type ResolvedOfferProvider = {
  id: string;
  code: string;
  providerType: string;
  affiliatePartnerId: string | null;
  adapter: PartOfferProviderAdapter<unknown>;
};

const PROVIDER_PRIORITY: Record<string, number> = {
  DIRECT_MANUFACTURER: 0,
  FACTORY: 1,
  FACTORY_PERFORMANCE: 2,
  DIRECT_AFFILIATE: 3,
  AUTHORIZED_RETAILER: 4,
  SCUDERIA: 5,
  SPECIALIST: 6,
  EBAY: 90,
  OTHER_MARKETPLACE: 100,
};

export function orderOfferProviders<T extends { providerType: string; code: string }>(providers: T[]) {
  return [...providers].sort((left, right) =>
    (PROVIDER_PRIORITY[left.providerType] ?? 50) - (PROVIDER_PRIORITY[right.providerType] ?? 50)
      || left.code.localeCompare(right.code),
  );
}

export async function runProviderWaterfall<TProvider, TOffer>(input: {
  providers: TProvider[];
  targetCount: number;
  execute: (provider: TProvider) => Promise<TOffer[]>;
  count?: (offer: TOffer) => number;
}) {
  const offers: Array<{ provider: TProvider; offer: TOffer }> = [];
  const runs: Array<{ provider: TProvider; accepted: number; error: string | null }> = [];
  let acceptedCount = 0;
  for (const provider of input.providers) {
    if (acceptedCount >= input.targetCount) break;
    try {
      const providerOffers = await input.execute(provider);
      offers.push(...providerOffers.map((offer) => ({ provider, offer })));
      const providerAccepted = providerOffers.reduce((sum, offer) => sum + (input.count?.(offer) ?? 1), 0);
      acceptedCount += providerAccepted;
      runs.push({ provider, accepted: providerAccepted, error: null });
    } catch (error) {
      runs.push({
        provider,
        accepted: 0,
        error: error instanceof Error ? error.message.slice(0, 500) : "Provider search failed",
      });
    }
  }
  return { offers, runs, acceptedCount };
}
