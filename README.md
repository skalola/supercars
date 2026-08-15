This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Fulfillment Email Delivery

The fulfillment mail dispatcher defaults to `MAIL_PROVIDER=log`, which renders templates, validates recipients, and writes audit events without sending real email. Production can enable real delivery with one of the supported HTTP providers:

```bash
MAIL_PROVIDER=resend # resend | sendgrid | postmark | log
MAIL_FROM="SUPERCAR DASH <no-reply@your-domain.com>"
MAIL_REPLY_TO="support@your-domain.com"
NEXT_PUBLIC_APP_URL="https://your-production-domain.com"
```

Provider-specific secrets:

```bash
RESEND_API_KEY="..."
SENDGRID_API_KEY="..."
POSTMARK_SERVER_TOKEN="..."
POSTMARK_MESSAGE_STREAM="outbound"
```

Unresolved or invalid partner emails are held before provider dispatch. Provider send failures create `Email FAILED` fulfillment audit events so admin operations can investigate and resend.

## Fulfillment Payment Processing

The fulfillment payment layer defaults to `PAYMENT_PROVIDER=ledger`, which records authorization/capture/void/refund state in the local fulfillment ledger without charging a real card. Production Stripe manual-capture mode can be enabled with:

```bash
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY="..."
STRIPE_WEBHOOK_SECRET="..."
```

Stripe mode requires a real Stripe payment method id in fulfillment `depositIntent.paymentMethod`. The platform creates a manual-capture authorization first, captures only after partner acceptance, voids on partner decline/expiration/pre-accept cancellation, and refunds according to cancellation policy after acceptance.

## Neon PostgreSQL Migration

The application now uses Prisma against PostgreSQL/Neon via `DATABASE_URL`. The original local SQLite inventory database should remain untouched and can be read separately during one-time migration with:

```bash
SQLITE_DATABASE_URL="file:./prisma/dev.db"
```

Safe migration commands:

```bash
npm run migrate:neon:dry
npm run migrate:neon
npm run verify:neon
```

`migrate:neon:dry` performs no Neon writes. `migrate:neon` requires the explicit non-dry command and never deletes or resets data. Migration reports are written to `migration-reports/`.

Required deployment environment variables:

```bash
DATABASE_URL="postgresql://..."
AUTH_SECRET="..."
NEXT_PUBLIC_APP_URL="https://..."
GOOGLE_CLIENT_ID="..."          # if Google login is enabled
GOOGLE_CLIENT_SECRET="..."      # if Google login is enabled
MAIL_PROVIDER="log|resend"
RESEND_API_KEY="..."            # if MAIL_PROVIDER=resend
STRIPE_SECRET_KEY="..."         # if PAYMENT_PROVIDER=stripe
STRIPE_WEBHOOK_SECRET="..."     # for Stripe webhook verification
PAYMENT_PROVIDER="ledger|stripe"
```

Do not seed, reset, or recrawl inventory during Vercel builds. `postinstall` and `build` only generate Prisma Client and build Next.js.

## Production Reliability

Run pending database migrations as a deliberate release step before deploying code that depends on them:

```bash
npx prisma migrate deploy
```

The CI workflow in `.github/workflows/ci.yml` audits high-severity dependencies, validates Prisma, lints transaction-critical code, runs financial regression tests, and performs a production build.

Before a production release, run the repeatable code and configuration gates:

```bash
npm run release:verify
npm run release:check-config
```

The configuration check reports only pass/fail status and never prints secret values. It fails when production is still configured for ledger payments, logged email, test credentials, localhost URLs, or missing auth, cron, Stripe, Resend, Google, database, and Blob settings.

Encrypted database backups require PostgreSQL client tools plus an encryption secret:

```bash
BACKUP_ENCRYPTION_KEY="..." npm run db:backup
CONFIRM_RESTORE=supercardash \
RESTORE_DATABASE_URL="postgresql://disposable-restore-target" \
BACKUP_ENCRYPTION_KEY="..." \
npm run db:restore -- .db-backups/supercardash-YYYYMMDDTHHMMSSZ.dump.enc
```

Use `pg_dump` and `pg_restore` from the same PostgreSQL major version as the source database. The local restore drill was validated with PostgreSQL 16 client and server tools.

Always run restore drills against a disposable Neon branch or separate database, never the production database.

Daily Neon usage alerts use the official consumption API and notify the operations email when network transfer or storage crosses 50%, 70%, or 85% of the configured allowance:

```bash
NEON_API_KEY="..."
NEON_ORG_ID="..."
NEON_PROJECT_ID="..."
NEON_NETWORK_TRANSFER_LIMIT_BYTES="5368709120"
NEON_STORAGE_LIMIT_BYTES_MONTH="5368709120"
OPERATIONS_ALERT_EMAIL="operations@your-domain.com"
CRON_SECRET="..."
```

Set quota values to the active Neon plan allowances. Consumption API access depends on the current Neon plan.

## Fulfillment Expiration Operations

Partner decision links can be ignored instead of accepted or declined. Admins can manually process expired links from `/admin/fulfillment`, or run the same lifecycle processor from the command line:

```bash
npm run process-fulfillment-expirations
```

The sweep marks elapsed partner tokens as `EXPIRED`, moves non-terminal requests to `EXPIRED`, releases open authorization holds, and writes system audit events. The same command is safe to call from a future daily scheduler.

See `docs/fulfillment-release-readiness.md` for the fulfillment checkpoint, QA command list, admin test login, and release gate.

## Test Logins

The local login page includes controlled credentials for testing both regular-user and admin flows when all values are configured:

```bash
USER_TEST_EMAIL="..."
USER_TEST_PASSWORD="..."
ADMIN_TEST_EMAIL="..."
ADMIN_TEST_PASSWORD="..."
```

Production disables these credential providers unless `ENABLE_TEST_CREDENTIALS="true"` is also explicitly configured. No default test email or password is used when values are absent.

Regular users land in `/transactions`. Admins land in `/admin/fulfillment`. The global navigation reads the active session and exposes sign in, transactions, admin, garage, and logout controls based on role.

Seed or reset local test transactions with:

```bash
npm run seed-test-transactions
```

This local-only command refuses to run with `NODE_ENV=production`, removes existing fulfillment request rows, preserves imported inventory data, and creates four tagged `SPRINT9B_TEST_FIXTURE` transactions for the regular user across dealer purchase, insurance, transport, and service flows.

Admins can open transaction URLs for operations review. Regular users remain limited to transactions where they are the buyer, owner, seller, or linked party.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
