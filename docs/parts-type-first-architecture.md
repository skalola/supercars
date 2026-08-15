# Parts Type First Architecture

The Parts Store uses one manufacturer-neutral navigation hierarchy:

```text
Vehicle
-> System
-> Component
-> Part Type
-> Available At
-> OEM / Best / Better / Good / Generic offers
```

## Durable records

- `PartCategory` represents a vehicle system.
- A normalized component group is projected from the part type and stored group.
- `PartComponentType` represents the selectable part type.
- `ModelPartComponent` represents vehicle applicability.
- Preferred brands and provider rules influence sourcing and ranking.

The hierarchy is usable without a supplier or canonical SKU record. It is shared across makes; Ferrari is the reference mapping rather than a separate taxonomy.

## Supplier boundary

System, component, and part-type navigation reads only stored taxonomy and applicability. A supplier lookup starts only after a user selects a part type. Supplier adapters return interchangeable offers with price, image, identifiers, fitment evidence, seller data, and an affiliate URL.

eBay results are stored as expiring `PartOffer` and `PartOfferContext` cache records. Marketplace discovery cannot create permanent canonical `PerformancePart` records. A marketplace offer may link to an existing canonical record when a strong OEM or MPN identifier matches.

## Ranking

Offers are ranked by provider relationship, OEM or MPN identity, fitment confidence, preferred-brand status, seller quality, and then price. Price alone cannot promote an offer to Best.

The user-facing tiers are `OEM`, `BEST`, `BETTER`, `GOOD`, and `GENERIC`. An OEM-number match alone does not claim that a marketplace item is genuine; the OEM tier requires verified genuine evidence or a configured factory relationship.

## Adding another make

Lamborghini, McLaren, and future JDM makes require applicability mappings, preferred-brand mappings, and any make-specific supplier query rules. They do not require a new storefront, taxonomy, offer schema, or ranking pipeline.
