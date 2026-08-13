# Neon Usage Guardrails

SUPERCAR DASH treats database network transfer as a limited production resource. These checks protect against relational overfetching without reducing the frontend experience.

## Commands

- `npm run db:usage-report` prints query, table-size, and row-count diagnostics.
- `npm run db:usage-reset` resets PostgreSQL query statistics before a controlled measurement window.
- `npm run db:usage-check` fails when a known expensive query shape exceeds its production limit.

Run the check after a representative production traffic window and before downgrading the Neon plan.

## Failure Thresholds

| Query or resource | Limit | Reason |
| --- | ---: | --- |
| Vehicle images by vehicle relation | 50 rows/call | Passport galleries are capped; inventory must not load every vehicle image. |
| Broad Vehicle row query | 100 rows/call | Wide VIN-decode records should be paginated or narrowly selected. |
| Listing row query | 200 rows/call | Public inventory is paginated at 48 and admin tables are paginated at 50. |
| Any application query | 1,000 rows/call | Catches previously unknown fanout patterns. |
| Public parts catalog | Warning at 200, failure at 240 | Server filtering and pagination must replace the current cached catalog payload before this ceiling. |

The 688-row make/model selector is intentionally cached for 24 hours and does not violate these limits. Aggregate queries returning one row are also safe.

## Measurement Procedure

1. Deploy the intended release and apply its migrations.
2. Run `npm run db:usage-reset`.
3. Exercise homepage, inventory, parts, makes, clubs, garage, passport, transactions, and admin pages.
4. Allow normal production traffic to run for several hours.
5. Run `npm run db:usage-report` and `npm run db:usage-check`.
6. Investigate every failure before increasing a threshold.

Thresholds are architecture limits, not alerts to dismiss. Raise one only when the associated UX intentionally requires a larger bounded result and the projected Neon transfer remains acceptable.
