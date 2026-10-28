# User Parts Marketplace Runbook

## Launch Gates

- `PAYMENT_PROVIDER=stripe` and a live Stripe secret are configured.
- Platform and Connect webhook signing secrets are configured.
- The Connect endpoint receives every event printed by `npm run verify:user-part-commerce`.
- `NEXT_PUBLIC_APP_URL` is the production HTTPS origin.
- The daily `/api/cron/user-part-orders` job is enabled and protected by `CRON_SECRET`.
- At least one seller has completed Stripe onboarding before a real purchase test.

Run `npm run verify:user-part-commerce` for a zero-write configuration check. It does not contact Stripe, send email, or modify the database.

## Source Of Truth

Use the SUPERCAR DASH transaction page for order state and Stripe for payment, refund, payout, and dispute evidence. Never repair a financial state by editing database records manually.

| Order state | Meaning | Admin action |
| --- | --- | --- |
| `CHECKOUT_PENDING` | Checkout exists but payment is not confirmed | Wait for Stripe; stale reservations release automatically |
| `PAID` | Stripe confirmed payment | Seller may fulfill |
| `FULFILLED` | Seller shipped or completed local handoff | Buyer may confirm receipt |
| `COMPLETED` | Buyer confirmed receipt | No routine action |
| `REFUND_PENDING` | Stripe refund is processing | Wait for webhook confirmation |
| `REFUNDED` | Stripe confirmed the refund | No routine action |
| `DISPUTED` | Stripe dispute is open | Pause fulfillment and review Stripe evidence |
| `CHARGEBACK` | Dispute closed for the buyer | Preserve records; do not retry fulfillment |
| `CANCELLED` | Checkout expired or was cancelled | Listing should return to active inventory when eligible |

## Listing Moderation

Hide a listing while investigating inaccurate fitment, unsafe delivery, suspicious ownership, misleading photos, or prohibited goods. Remove it when the violation is confirmed or repeatedly misleading. Always record a concise factual moderation reason.

Do not approve listings that evade emissions or safety law, contain stolen goods, lack a valid image, have no declared fitment unless the component permits universal fitment, or belong to a seller who cannot receive Stripe payments.

## Refunds And Disputes

The seller initiates a refund from the transaction page. `REFUND_PENDING` is not a completed refund. The buyer receives final confirmation only after Stripe confirms it.

During an active dispute, do not ship, complete, or separately refund the order unless Stripe support specifically directs that action. Review the connected-account dispute in Stripe and preserve listing, tracking, delivery, and communication evidence.

## Failed And Abandoned Checkout

The checkout endpoint reuses an active checkout and rejects concurrent creation. Truly expired sessions and abandoned creation attempts are released on retry. The daily reconciliation job provides a second recovery path.

If a listing remains reserved unexpectedly, inspect the latest order and Stripe Checkout session first. Do not change the listing or order directly in Postgres.

## Incident Checklist

1. Record the order ID, listing ID, account, timestamp, and visible status.
2. Check the admin marketplace panel and Stripe event delivery.
3. Confirm whether the Connect webhook event was received once.
4. Avoid replaying a payment or refund action while its state is pending.
5. Resolve listing or order issues through existing moderation and transaction actions.
6. Record the outcome in the issue review note.
