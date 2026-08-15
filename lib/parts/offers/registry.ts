import { EBAY_PART_OFFER_PROVIDER } from "@/lib/ebay/browse.server";
import type { PartOfferProviderAdapter } from "@/lib/parts/offers/provider";

const PROVIDERS = new Map<string, PartOfferProviderAdapter<unknown>>([
  [EBAY_PART_OFFER_PROVIDER.provider, EBAY_PART_OFFER_PROVIDER as PartOfferProviderAdapter<unknown>],
]);

export function getPartOfferProviderAdapter(providerCode: string) {
  return PROVIDERS.get(providerCode.toUpperCase()) ?? null;
}

export function listRegisteredPartOfferProviders() {
  return [...PROVIDERS.values()].map((provider) => ({
    code: provider.provider,
    providerType: provider.providerType,
  }));
}
