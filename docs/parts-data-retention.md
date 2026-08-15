# Parts Marketplace Data Retention

## Neon connection policy

Application traffic must use Neon's pooled connection string in `DATABASE_URL` (the hostname contains `-pooler`). Keep a direct connection string outside the application runtime only when a database administration tool explicitly requires it. The production configuration check fails when a Neon application URL is not pooled.

## Query and index policy

- `PartOffer(active, availability, lastSeenAt)` supports bounded lifecycle transitions without scanning every offer.
- `PerformancePart(status, lastCheckedAt)` supports incremental stale-first offer refreshes.
- `PartAffiliateClick(createdAt)` supports time-window analytics and future retention without a full click-table scan.
- Existing unique indexes on `(provider, externalItemId)`, `(modelId, componentTypeId)`, and `(offerId, modelPartComponentId)` remain the identity and deduplication boundaries.

Taxonomy API responses cache for one day. The parts-store shell and canonical catalog cache for one hour. Offer responses cache at the edge for five minutes with stale-while-revalidate, while eBay refreshes run in bounded background or scheduled work. Affiliate redirects are never cached.

After introducing or restoring the offer fingerprint column, run `npm run backfill:part-offer-hashes` once. The command processes only missing fingerprints in bounded 250-row transactions and is safe to rerun.

Canonical taxonomy, product families, compatibility, identifiers, maintenance links, and performance evidence are retained indefinitely unless an administrator explicitly retires them.

eBay offers follow a separate lifecycle:

- `ACTIVE`: currently available and within its refresh window.
- `STALE`: expired or no longer returned by a refresh.
- `INACTIVE`: stale for 14 days.
- Purge candidate: inactive for 45 days.

Affiliate clicks remain as lightweight attribution records. Deleting an offer does not delete its canonical part or click record. Raw eBay responses and image binaries are never stored in PostgreSQL.

`npm run lifecycle:part-offers` is report-only. Transitions require `--execute-transitions`; deletion requires the additional explicit `--purge` flag.
