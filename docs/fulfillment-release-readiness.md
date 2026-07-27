# Fulfillment Release Readiness

Sprint 8J checkpoint for the SUPERCARS fulfillment layer.

## Current Scope

The platform now supports four accountless fulfillment partner workflows:

- `DEALER_PURCHASE`
- `INSURANCE_QUOTE`
- `TRANSPORT_QUOTE`
- `SERVICE_BOOKING`

The shared lifecycle is:

```text
Platform request
→ email dispatch
→ tokenized partner package
→ partner accept / decline / ignore
→ payment settlement
→ buyer/owner transaction view
→ admin operations review
```

Partners are not platform users. They receive scoped package links and can accept, decline, or ignore the request without an account.

## Production Boundaries

Email delivery defaults to `MAIL_PROVIDER=log`.

Supported production providers:

- `resend`
- `sendgrid`
- `postmark`

Payment processing defaults to `PAYMENT_PROVIDER=ledger`.

Supported production provider:

- `stripe` with manual-capture PaymentIntents

Manual capture is required. Deposits are authorized first, captured only after partner acceptance, voided on partner decline/expiration/pre-accept cancellation, and refunded through the provider boundary when admin or policy settlement requires it.

## Operator Commands

```bash
npm run seed-partner-registry
npm run seed-fulfillment-demo
npm run process-fulfillment-expirations
npm run qa:fulfillment
```

`process-fulfillment-expirations` is safe to call manually today and from a future daily scheduler.

## Admin Testing

Local test admin:

```text
admin@supercars.test
supercars-admin
```

Admin surfaces:

- `/admin/fulfillment`
- `/admin/partners`

User transaction surfaces:

- `/transactions`
- `/transactions/[id]`

Partner surfaces:

- `/fulfillment/[token]`
- `/fulfillment/[token]/accept`
- `/fulfillment/[token]/decline`

Accept/decline GET requests render confirmation pages only. POST is required to finalize a partner decision.

## Security And Scoping Checks

Current guarantees:

- zero guessed partner emails
- no partner login required
- single-purpose decision tokens
- token expiration support
- partner package scoping excludes platform settlement internals
- buyer/owner transaction events exclude raw notes and audit metadata
- partner accept/decline POST captures admin-only audit context
- admin can resend, cancel/refund, mark complete, process expired links, and release/refund financial state

## Checkpoint Notes

Intentional fulfillment code changes span:

- `app/actions`
- `app/admin`
- `app/api/payments`
- `app/fulfillment`
- `app/transactions`
- `components/admin`
- `components/transactions`
- `lib/admin`
- `lib/fulfillment`
- `lib/mail`
- `lib/payments`
- `scripts`
- `scratch`
- `types`
- `prisma/schema.prisma`
- `prisma/migrations/20260727090000_fulfillment_core`

Do not treat `prisma/dev.db` fixture churn as release code. The scratch QA scripts create local dummy transactions, so `prisma/dev.db` changes whenever the fulfillment suite runs.

## Release Gate

Before moving into marketing automation and branding, run:

```bash
npx tsc --noEmit
npm run lint:fulfillment
npm run qa:fulfillment
npx prisma validate
git diff --check
npm run build
```

If this is being prepared as a commit or PR, review `git status --short` and intentionally exclude local database fixture churn unless the team explicitly wants the seeded SQLite state committed.

`npm run lint` currently reports older repo-wide lint debt outside the fulfillment release gate, especially inventory ingestion scripts and legacy scratch files using explicit `any`. Use `npm run lint:fulfillment` for this checkpoint, then schedule a separate repository lint cleanup before tightening CI to repo-wide lint.

The fulfillment QA command intentionally excludes obsolete early sprint fixtures that predate strict VIN-backed dealer package enforcement. Those archived tests should be updated or removed in a separate cleanup pass rather than used as release blockers.
