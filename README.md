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
MAIL_FROM="SUPERCARS <no-reply@your-domain.com>"
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

## Fulfillment Expiration Operations

Partner decision links can be ignored instead of accepted or declined. Admins can manually process expired links from `/admin/fulfillment`, or run the same lifecycle processor from the command line:

```bash
npm run process-fulfillment-expirations
```

The sweep marks elapsed partner tokens as `EXPIRED`, moves non-terminal requests to `EXPIRED`, releases open authorization holds, and writes system audit events. The same command is safe to call from a future daily scheduler.

See `docs/fulfillment-release-readiness.md` for the fulfillment checkpoint, QA command list, admin test login, and release gate.

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
