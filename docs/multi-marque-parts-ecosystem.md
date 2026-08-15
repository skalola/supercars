# Multi-Marque Parts Ecosystem

## Stable knowledge graph

`PartCategory` and `PartComponentType` are global automotive concepts. `ModelPartComponent` determines model applicability, `PerformancePart` is the canonical product, and `PartCompatibility` carries make/model/year fitment. Maintenance rules, installed modifications, and performance data all reference this same canonical graph.

## Commerce graph

- `PartBrand` identifies the product manufacturer. Its type describes OEM, factory-performance, aftermarket, tuner, tire, wheel, service-part, or other brands.
- `PartOfferProvider` identifies where an offer comes from, such as eBay, a direct affiliate, a manufacturer, or an authorized retailer.
- `PartOffer.sellerName` remains the individual marketplace seller. Product brand, provider, and seller are deliberately separate.
- `PreferredPartBrand` configures a brand for a vehicle make, optionally narrowed to a category or component. Component mappings override category mappings, and category mappings override make-wide mappings.

No credentials or provider secrets belong in these records. `trackingConfigName` may identify secure external configuration, but credentials remain in environment variables or another secret manager.

## Affiliate state and ranking

Affiliate states are `NOT_CONTACTED`, `OUTREACH`, `PENDING`, `APPROVED`, `ACTIVE`, `PAUSED`, and `REJECTED`. A direct or preferred offer can receive partner ranking only when the mapping is enabled, its status is `APPROVED` or `ACTIVE`, and the configured provider is active. Pending configuration never receives a direct-partner rank.

Ranking order is direct affiliate, factory/factory-performance, preferred affiliate, authorized retailer, exact OEM, exact MPN, verified fitment, high-confidence marketplace, then generic marketplace. eBay remains in the result set as a fallback or alternative when a higher-priority offer exists.

## Production boundary

Ferrari is the only production-enabled ecosystem. Lamborghini, McLaren, and Nissan examples in `lib/parts/ecosystem-config.ts` are unit-test fixtures only. The Ferrari seed refuses to ingest or configure another make.

Run:

```bash
npm run seed-ferrari-parts-ecosystem
npm run report:parts-partners
```

The report provides lightweight counts by relationship and affiliate status without exposing tracking configuration or secrets.
