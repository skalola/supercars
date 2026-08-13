# Neon Usage Guardrails

SUPERCAR DASH treats database network transfer as a limited production resource. These checks protect against relational overfetching without reducing the frontend experience.

## Commands

- `npm run db:usage-report` prints query, table-size, and row-count diagnostics.
- `npm run db:usage-reset` resets PostgreSQL query statistics before a controlled measurement window.
- `npm run db:usage-check` fails when a known expensive query shape exceeds its production limit.
- `npm run db:usage-snapshot` stores the current production counters as a local baseline.
- `npm run db:usage-compare` ranks traffic since that baseline by incremental rows, calls, and execution time.

Run the check after a representative production traffic window and before downgrading the Neon plan.

## Failure Thresholds

| Query or resource | Limit | Reason |
| --- | ---: | --- |
| Vehicle images by vehicle relation | 50 rows/call | Passport galleries are capped; inventory must not load every vehicle image. |
| Broad Vehicle row query | 100 rows/call | Wide VIN-decode records should be paginated or narrowly selected. |
| Listing row query | 200 rows/call | Public inventory is paginated at 48 and admin tables are paginated at 50. |
| Any application query | 1,000 rows/call | Catches previously unknown fanout patterns. |
| Public parts result page | 24 products/call | Server filtering and pagination keep affiliate catalog growth from increasing per-request transfer. |

The 688-row make/model selector is intentionally cached for 24 hours and does not violate these limits. Aggregate queries returning one row are also safe.

The compact public parts shell is cached for 24 hours and invalidated immediately by admin part mutations. Product results and compatibility details are fetched in server-filtered pages of 24, so affiliate imports can grow without increasing each storefront response.

## Measurement Procedure

1. Deploy the intended release and apply its migrations.
2. Run `npm run db:usage-reset`.
3. Exercise homepage, inventory, parts, makes, clubs, garage, passport, transactions, and admin pages.
4. Allow normal production traffic to run for several hours.
5. Run `npm run db:usage-snapshot` after the controlled route trace establishes a clean baseline.
6. After the normal traffic window, run `npm run db:usage-compare`.
7. Run `npm run db:usage-report` and `npm run db:usage-check` for the full diagnostic and guardrails.
8. Investigate every failure before increasing a threshold.

Snapshots are written under `.neon-usage/` and remain local because they contain production SQL shapes. If Neon suspends or restarts the compute, PostgreSQL may reset its counters; the comparison command detects this and asks for a fresh baseline instead of reporting misleading negative deltas.

Thresholds are architecture limits, not alerts to dismiss. Raise one only when the associated UX intentionally requires a larger bounded result and the projected Neon transfer remains acceptable.

The shared make/model selector is intentionally a full taxonomy read. It is cached for 24 hours and guarded at 1,000 rows per cache fill. A single narrow catalog hydration is expected; repeated catalog calls in the production comparison indicate cache invalidation or deployment churn and should be investigated before splitting the selector into additional requests.

The public parts storefront reads fitment labels with narrow SQL joins rather than Prisma relation hydration. This avoids separate Make and Model fanout queries while preserving the same API shape. A 24-product page may return at most 288 compatibility rows before the usage guardrail fails.
