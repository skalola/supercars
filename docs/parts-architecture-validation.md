# Parts Architecture Validation

## Audit result

The durable Prisma layer was already predominantly manufacturer-neutral: `PartCategory`, `PartComponentType`, `ModelPartComponent`, `ModelPartApplicability`, `PreferredPartBrand`, `PartOfferProvider`, `PartOffer`, and `CatalogReferenceSource` are shared records.

The audit found Ferrari-specific production behavior in four places:

1. `PartsTuningShop` enabled the component browser with a Ferrari name check and called Ferrari-only URLs.
2. The component service fixed every query to the Ferrari make and added Ferrari brand lists.
3. eBay query construction and compatibility validation inserted Ferrari directly.
4. Marketplace normalization inferred brands and classifications from a Ferrari-only brand list.

Ferrari-specific seed data, catalog parsing, applicability fixtures, maintenance knowledge, and regression tests remain intentionally Ferrari-specific.

## Validated architecture

```text
Global PartCategory (System)
-> normalized Component group
-> PartComponentType (Part Type)
-> ModelPartComponent / ModelPartApplicability
-> PreferredPartBrand
-> PartOfferProvider adapter
-> cached PartOffer / PartOfferContext
-> OEM / Best / Better / Good / Generic
```

The storefront now selects the universal engine from active applicability mappings, not a manufacturer name. Generic vehicle routes accept make, model, system, and part-type slugs. Existing Ferrari routes remain compatibility wrappers.

`PartsMarqueConfig` is the public enablement gate. A mapping by itself cannot expose a fixture marque. Offer providers are selected from each marque's enabled provider codes, and scheduled refresh/recovery services accept a generic make context.

Maintenance rules can link directly to `PartComponentType`, preserving a universal recommendation such as Engine Air Filter independently from whichever supplier offer is currently available.

Catalog reference sources and offer providers remain independent tables. A source can describe identity and fitment without becoming a purchase provider.

## Marque enablement

1. Add or validate make and model metadata.
2. Run `npm run map:parts-applicability -- --make=<slug>` in dry-run mode.
3. Review all variant-dependent, year-dependent, low-confidence, and high-risk candidates.
4. Apply approved universal mappings with `--execute`; store reviewed exceptions in `PartApplicabilityOverride`.
5. Configure factory and preferred brands through `PreferredPartBrand`.
6. Configure active offer providers and catalog reference sources independently.
7. Run `npm run report:parts-marque-coverage -- --make=<slug>`.
8. Test representative part types and affiliate URLs.
9. Set `PartsMarqueConfig.partsEnabled` only after every coverage check passes.

Dry-run mapping never publishes another marque. Execute mode persists only high-confidence, non-review candidates and does not overwrite existing reviewed mappings.

## Neon efficiency

Systems, component groups, part types, brands, and providers are stored once. New marques add relational applicability and preference rows. Marketplace results remain TTL-bound offer cache records and cannot create permanent canonical products.
