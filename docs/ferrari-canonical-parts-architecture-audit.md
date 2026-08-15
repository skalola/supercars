# Ferrari Canonical Parts Architecture Audit

Date: 2026-08-15

## Scope

This audit is the Sprint 12A baseline for moving the Ferrari Parts Store from
component-level marketplace discovery to a canonical product catalog.

No schema, storefront, offer, or catalog records were changed during this
audit. Database measurements were collected with read-only report commands.

## Executive Finding

The repository already contains most of the infrastructure needed for the
target architecture. `PerformancePart` is the existing product record and can
remain the physical Prisma model behind the canonical-part domain. `PartBrand`,
`PartIdentifier`, `PartCompatibility`, `PartOffer`, provider adapters, eBay
OAuth, affiliate URLs, click tracking, retention, and cached storefront reads
are reusable.

The current Ferrari customer path is still component-offer-first:

```text
ModelPartComponent
-> component-level eBay search
-> PartOfferContext
-> seller cards
```

Most records called parts are marketplace-derived product families rather than
independently verified products. The target path must be:

```text
ModelPartComponent
-> verified PerformancePart (canonical product)
-> PartIdentifier + PartCompatibility + catalog provenance
-> part-specific PartOffer
-> affiliate outbound route
```

The migration should evolve the existing models instead of creating a second
parts platform.

## Measured Baseline

Read-only reports run:

```text
npm run report:parts-db
npm run report:ferrari-parts
npm run report-ferrari-components
```

### Global parts database

| Metric | Current value |
| --- | ---: |
| Component types | 270 |
| Model-component mappings | 15,055 |
| `PerformancePart` records | 4,490 |
| Part identifiers | 2,509 |
| Part compatibility rows | 5,210 |
| Active part offers | 3,849 |
| Inactive part offers | 21 |
| Affiliate clicks | 749 |
| Parts with performance gains | 19 |
| Offer providers | 2 |
| Preferred-brand mappings | 13 |
| Database size | 77,881,344 bytes |
| Parts-table footprint | 44,851,200 bytes |

The parts subsystem is approximately 57.6% of the current database footprint.
`PartOffer` is the largest parts table at roughly 15.0 MB including indexes.

### Ferrari baseline

| Metric | Current value |
| --- | ---: |
| Ferrari model records | 59 |
| Ferrari systems | 17 |
| Ferrari component types | 183 |
| Ferrari model-component mappings | 10,043 |
| Ferrari-associated `PerformancePart` records | 4,382 |
| Marketplace-normalized families | 888 |
| Provisional marketplace families | 3,479 |
| Canonical-family records | 15 |
| Ferrari parts with identifiers | 1,881 |
| Ferrari parts with affiliate offers | 3,615 |
| Ferrari Scuderia canonical records | 0 |
| Maintenance-to-part links | 0 |
| Component mappings with live offers | 667 |
| Component mappings without live offers | 9,376 |
| Active Ferrari affiliate offers | 3,812 |
| Affiliate URL coverage on active Ferrari offers | 100% |

Of all 4,490 `PerformancePart` records, 4,367 have
`sourceCatalog = EBAY_PRODUCT_FAMILY`. Only 123 records globally currently use
`productFamilyType = CANONICAL`; 108 of those are outside Ferrari compatibility.

The current Ferrari coverage report measures components with marketplace
offers. It does not measure components with verified canonical products and
must be replaced in the reporting sprint.

## Current Architecture

### Taxonomy and applicability

- `PartCategory` stores the normalized top-level systems.
- `PartComponentType` stores normalized components, aliases, fitment risk, and
  search templates.
- `ModelPartComponent` maps models to components and stores only a string
  applicability value plus notes.
- The Ferrari seed currently produces 17 systems, 183 components, and 10,043
  mappings across 59 model records.
- `ModelSpec`, `ModelVariant`, and `Vehicle` already contain useful engine,
  transmission, drivetrain, year, trim, turbo, and electrification context.
- Applicability is not yet expressed as structured model/variant rules. Several
  Ferrari records are aliases, grouped model records, race cars, or game-only
  concepts and require a supported-model policy before canonical coverage is
  presented as complete.

### Product identity

- `PerformancePart` already contains brand, product name, slug, component,
  source fields, OEM/part numbers, performance gains, image, and status.
- `PartBrand` is already first-class and supplier-neutral.
- `PartIdentifier` supports typed normalized identifiers with source and
  confidence.
- `PartCompatibility` supports make, model, years, trim, engine, notes, and
  confidence.
- There is no independent catalog-reference source or reference record.
- Product identity confidence is overloaded into `sourceConfidence` and
  `productFamilyType`; neither expresses the required canonical confidence
  states cleanly.
- Canonical imagery has no dedicated provenance/license model. Many current
  product images originate from marketplace offers and are not a durable
  canonical asset.

### Product discovery

- `lib/parts/ferrari-discovery.ts` executes resumable component queries with
  bounded work, checkpoints, retry handling, and source-run reporting.
- `lib/parts/ferrari-product-normalizer.ts` extracts brand and identifiers from
  qualified eBay offers.
- When a strong identifier is found, the normalizer creates a
  `PerformancePart` with `sourceCatalog = EBAY_PRODUCT_FAMILY`.
- Without a strong identifier, the offer remains component-level or becomes a
  provisional marketplace family. This data is useful evidence but cannot be
  treated as a verified product catalog.
- `lib/parts/sources/scuderia.ts` can crawl Ferrari OE diagrams and build
  OEM-keyed records, but no `SCUDERIA_FERRARI_OE` records exist in the current
  database.
- There is no RockAuto reference adapter and no generic reference layer.

### Offer discovery

- `lib/ebay/oauth.server.ts` correctly uses production client credentials,
  server-only execution, the Browse API scope, in-memory token reuse, request
  coalescing, and a five-minute refresh buffer.
- `lib/ebay/browse.server.ts` contains both canonical-part and component-level
  search functions.
- Canonical-part search currently prioritizes OEM number, then vehicle plus part
  name. It does not yet implement brand + MPN, MPN + vehicle, all identifiers,
  or the complete required fallback order.
- Component search can issue up to ten query plans and directly defines the
  offers shown after a user selects a component.
- `PartOfferContext` connects offers directly to `ModelPartComponent`; 4,783
  such contexts currently exist.
- `PartOffer.partId` already supports the desired part-level relationship. Of
  3,870 total offers, 3,715 have a part ID and 155 do not.
- `lib/parts/offer-refresh.ts` already refreshes by part and preserves offer
  TTL, content hashes, heartbeat updates, and write avoidance.
- `lib/parts/offer-ranking.ts` already allows future direct affiliates and
  preferred brands to outrank marketplace offers.

### Storefront

- `components/parts/PartsTuningShop.tsx` has a Ferrari-specific branch.
- Current public flow is vehicle -> system -> component -> live seller offers.
- Selecting a component calls
  `/api/parts/ferrari/[model]/components/[component]/offers`.
- That route can immediately execute a component-level eBay refresh when the
  component cache is empty and can schedule stale refreshes in the background.
- The UI labels those seller listings as "Available Products" and renders
  seller-derived cards. This is the primary behavior that must change.
- The generic storefront can already render `PerformancePart` cards with
  cached pagination and selective queries, but public eligibility currently
  requires a source URL, source-verified confidence, image, and compatibility.
- The approved GT7-inspired listing card belongs to a canonical product grid,
  not the current component-offer grid.

### Affiliate and lifecycle behavior

- eBay Browse requests send `EBAY_EPN_CAMPAIGN_ID` and request
  `itemAffiliateWebUrl`.
- Public offer redirects use `/out/parts/offers/[offerId]`, validate active and
  unexpired offers, log deduplicated clicks, and redirect to the affiliate URL.
- The offer route currently permits a component context when no active part is
  attached. After migration, public purchase actions should require an active
  canonical part; context-only offers should remain internal discovery data.
- Retention, stale-offer cleanup, content hashes, bounded refreshes, and cached
  catalog reads are already suitable for Neon-efficient operation.

### Maintenance and performance

- `MaintenanceRulePart` and helper functions already support maintenance rule
  -> canonical part -> offers, but the database currently has zero links.
- Installed parts already reference `PerformancePart`.
- Build-aware recommendations enforce transmission, drivetrain, trim, and
  aspiration rules and use existing modifications.
- Performance gains are currently fields on `PerformancePart`; only 19 records
  have gains. The requested evidence/configuration layer does not exist as a
  first-class schema model and should not be fabricated from marketplace copy.

## Reuse Decisions

Keep and extend:

1. `PerformancePart` as the physical canonical product table. Introduce
   canonical domain naming in services and UI without duplicating product rows.
2. `PartBrand`, `PartIdentifier`, `PartCompatibility`, `PartOffer`,
   `PartOfferProvider`, `PreferredPartBrand`, and `PartAffiliateClick`.
3. The normalized 17-system taxonomy and reusable component aliases.
4. eBay OAuth, Browse adapter, affiliate attribution, offer scoring, ranking,
   retention, click routing, content hashing, and refresh locking.
5. `PartSourceRun` and discovery checkpoints for resumable enrichment.
6. Cached, paginated, selective storefront query patterns.
7. Maintenance-rule and installed-part relationships.

Retain as internal migration evidence:

1. `PartOfferContext` and component-level search diagnostics.
2. Provisional marketplace families.
3. Existing eBay offer metadata and identifier extraction results.
4. Source-run and rejection history.

Do not retain as public product identity:

1. An eBay title as the canonical product name.
2. A seller image as the only durable canonical image.
3. A component-level offer as a product.
4. A product family without a verified identifier as public inventory.

## Required Schema Evolution

Sprint 12B should evolve the existing schema with the following concepts:

1. Add explicit product type and identity confidence to `PerformancePart`.
2. Add `CatalogReferenceSource` and `PartCatalogReference` with source URL,
   factual source fields, fitment scope, confidence, status, and checked dates.
3. Add separate catalog-gap and offer-gap status fields or records.
4. Extend compatibility/applicability for variant, transmission, drivetrain,
   body style, aspiration, and hybrid context where model-level data is not
   sufficient.
5. Add canonical image provenance, licensing, confidence, and review state.
6. Strengthen cross-part identifier uniqueness so one verified brand + MPN/OEM
   cannot silently produce multiple canonical products.
7. Preserve nullable `PartOffer.partId` temporarily for migration evidence,
   while requiring `partId` for public offers at the service boundary.
8. Keep legacy direct-commerce fields on `PerformancePart` read-only during
   migration; new seller prices and URLs belong only to `PartOffer`.

Do not rename `PerformancePart` in the first migration. A physical table rename
would add risk without improving the domain model and would touch garage mods,
maintenance, affiliate clicks, admin pages, recommendations, and public routes.

## Data Migration Plan

Classify every Ferrari `PerformancePart` before public cutover:

1. Preserve verified non-marketplace canonical records.
2. Merge records with an exact normalized brand + MPN or brand + OEM identity.
3. Attach current eBay evidence as catalog references or offer evidence, not as
   the sole product authority.
4. Convert `NORMALIZED_MARKETPLACE` records only when identifier and fitment
   evidence meet the new threshold.
5. Mark `PROVISIONAL_MARKETPLACE` records unresolved and hide them from the
   canonical product grid.
6. Preserve their offers and contexts for future resolution and diagnostics.
7. Attach part-level offers only after exact product identity is established.
8. Do not delete offer history, clicks, installed-part links, or maintenance
   links during deduplication.

The migration must be resumable and idempotent. Every merge needs a dry-run
report, deterministic survivor selection, relationship reassignment, collision
handling, and an audit trail.

## Target Service Boundaries

```text
Catalog discovery service
  -> writes canonical products, identifiers, compatibility, references

Offer discovery service
  -> reads one canonical product and its identifiers
  -> writes volatile seller offers for that part

Storefront catalog service
  -> reads systems, components, and canonical products only

Offer service
  -> reads active offers only after a canonical part is selected

Affiliate redirect service
  -> requires active canonical part + active unexpired affiliate offer
```

Component-level eBay discovery remains an admin/enrichment tool and must not be
called by normal component navigation after storefront cutover.

## Risks and Controls

| Risk | Required control |
| --- | --- |
| Marketplace families promoted as products | Public query requires verified identity confidence and catalog evidence |
| Duplicate canonical products | Normalized identifier constraints and deterministic merge command |
| Incorrect fitment | Structured applicability plus customer-facing confidence labels |
| Broken installed mods/click history | Reassign all foreign keys before retiring duplicate rows |
| Copyright or access-control violation | Store factual reference data only; never bypass blocked sources |
| Seller image instability | Canonical image provenance and a non-fake no-image state |
| Excess Neon growth | Stable/volatile separation, selective fields, no raw payloads, bounded retention |
| Excess eBay calls | No calls on system/component navigation; part-keyed TTL and request coalescing |
| Inflated coverage reporting | Measure canonical product coverage separately from active offer coverage |
| False performance claims | Require evidence before exposing gain labels |

## Sprint 12B Entry Gate

Sprint 12B may begin with these decisions fixed:

1. `PerformancePart` remains the canonical product table.
2. `PartBrand` remains the product manufacturer record.
3. `PartOfferProvider` remains the marketplace/direct supplier abstraction.
4. A new catalog-reference layer is required.
5. Marketplace-derived provisional families are migration evidence, not public
   canonical products.
6. Public component navigation must stop triggering marketplace searches after
   the canonical storefront is ready.
7. The approved part card renders canonical product identity; price/provider
   are derived from the best active offer and never define the product.

Sprint 12B should deliver only schema, constraints, migration-safe domain
helpers, and tests. It should not yet crawl reference sources or switch the
public storefront.

## Sprint 12A Acceptance Result

- Existing architecture inspected: complete.
- Reusable infrastructure identified: complete.
- Required changes identified: complete.
- Existing data migration needs measured: complete.
- Baseline reports captured: complete.
- Runtime behavior or customer UI changed: no.
