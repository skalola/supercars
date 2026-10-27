# Model Catalog Ingestion

The model catalog separates permanent vehicle identity from source observations.

## Source priority

1. Official manufacturer model and heritage catalogs
2. EPA FuelEconomy.gov base-model and engineering records
3. NHTSA vPIC manufacturer-submitted names
4. Community metadata and licensed imagery

An official OEM record or explicit EPA base-model can establish a model family. An unmatched NHTSA name is evidence for review, not permission to create a model; this prevents trims and editions from becoming duplicate families.

## Official lineup input

`npm run ingest-oem-model-lineup -- --input=lineup.json` audits a file. Add `--apply` only after reviewing the summary and applying the database migration.

```json
[
  {
    "makeSlug": "honda",
    "sourceName": "Honda vehicle archive",
    "sourceUrl": "https://www.honda.com/example-model-archive",
    "externalId": "optional-source-id",
    "modelName": "Prelude",
    "canonicalFamilyName": "Prelude",
    "variantName": null,
    "productionStartYear": 1978,
    "productionEndYear": 2001,
    "bodyStyle": "Coupe",
    "category": "Sports coupe"
  }
]
```

The source URL must belong to the configured official domain for that make. The importer records a compact source fingerprint and lineage; it does not store entire source payloads.

## OEM maintenance input

`npm run ingest-oem-maintenance -- --input=maintenance.json` audits source-backed fixed intervals. Add `--apply` after review.

Rules inherit in this order: variant, model, powertrain, make, universal. More specific guidance replaces generic guidance for the same service. Condition-based maintenance systems must not be converted into invented fixed intervals.

## Quality checks

- `npm run audit-canonical-model-catalog`
- `npm run audit-canonical-model-catalog -- --strict`
- Admin coverage: `/admin/models`

The strict check fails on invalid production-year ranges. Missing imagery, descriptions, evidence, core specs, and specific maintenance remain visible as coverage work instead of being filled with placeholders.
