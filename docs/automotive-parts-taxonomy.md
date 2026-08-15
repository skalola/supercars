# Automotive Parts Taxonomy

The parts platform stores components under 17 stable automotive systems. These
systems are shared by supplier catalogs, model fitment, marketplace offers,
manual passport modifications, storefront filters, and reporting.

Legacy slugs are accepted only as import aliases. `category-system.ts` maps them
to canonical storage systems, so historical catalog scripts cannot reactivate
retired categories. Build recommendations use a separate functional view. For
example, both a cold-air intake and a turbocharger live under Air Induction, but
their names resolve to `intake` and `forced-induction` respectively for build
stage, support-system, and safety decisions.

Carbon fiber is a material attribute, not a top-level category. OEM part numbers,
supplier SKUs, model fitment, replacement type, system subgroup, and fitment risk
remain component attributes rather than duplicate component identities.

Offer confidence is risk-aware:

- `EXACT_MATCH`: canonical identifier and compatible vehicle evidence.
- `HIGH_CONFIDENCE`: strong component and structured fitment evidence.
- `LIKELY_COMPATIBLE`: suitable for low-risk components when evidence is useful
  but not exact.
- `POSSIBLE_MATCH`: retained for review and recovery, not presented as verified.
- `REJECTED`: conflicts, wrong component types, universal products, or unsafe
  evidence combinations.

Public empty states say that verified offers are unavailable or being checked.
Discovery implementation details and supplier failures stay in operational logs.

## Integrity gate

Run `npm run audit:ferrari-component-taxonomy` before taxonomy seeds or release
migrations. The audit compares the checked-in library with PostgreSQL and fails
when it finds an unapproved system, duplicate component identity, ambiguous
alias, missing icon identity, active legacy container, or source/database drift.
The Ferrari source library is intentionally constrained to 120-200 reusable
component types; supplier products and marketplace offers remain separate rows.

## Model applicability

Ferrari component exposure is resolved by `ferrari-applicability.ts`. Explicit
model evidence can produce `APPLICABLE` or `NOT_APPLICABLE`; mixed model-family
specifications produce `VARIANT_DEPENDENT`, and production ranges crossing a
technology threshold produce `YEAR_DEPENDENT`. Unknown powertrain evidence is
never promoted to a confident fitment. Only `APPLICABLE` model/component
mappings are public until an exact vehicle year or variant can resolve a
conditional rule.

Run `npm run audit:ferrari-component-applicability` to compare the deterministic
rules with current PostgreSQL mappings and report overexposed, missing, or stale
records without modifying data.
