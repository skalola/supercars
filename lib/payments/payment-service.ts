/**
 * lib/payments/payment-service.ts
 *
 * Sprint 8B payment provider boundary.
 *
 * Local development defaults to the internal ledger provider. Production can use
 * Stripe PaymentIntents with manual capture by setting PAYMENT_PROVIDER=stripe.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getDealerPurchaseDepositCentsForPrice } from "@/lib/pricing/dealer-purchase-fees";

export type PaymentProviderName = "ledger" | "stripe";

export interface AuthorizeDepositInput {
  amount: number;
  currency?: string;
  paymentMethod?: string;
  fulfillmentRequestId?: string;
  publicTransactionToken?: string;
}

export interface PaymentOperationResult {
  provider: PaymentProviderName;
  transactionRef: string;
  providerActionId?: string;
}

export interface PaymentWebhookResult {
  received: boolean;
  eventType?: string;
  fulfillmentRequestId?: string | null;
  alreadyProcessed?: boolean;
}

export interface CreateServiceBookingCheckoutInput {
  fulfillmentRequestId: string;
  vehicleId: string;
  vin: string;
  ownerUserId: string;
  publicTransactionToken: string;
  amountCents: number;
  currency?: string;
}

export interface CreateDealerPurchaseCheckoutInput {
  fulfillmentRequestId: string;
  listingId: string;
  vin: string;
  buyerUserId: string;
  publicTransactionToken: string;
  amountCents: number;
  currency?: string;
}

function getPaymentProvider(): PaymentProviderName {
  return process.env.PAYMENT_PROVIDER === "stripe" ? "stripe" : "ledger";
}

function normalizeCurrency(currency: string | undefined): string {
  return (currency || "USD").trim().toLowerCase();
}

function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function getServiceBookingFeeCents(): number {
  const cents = Number(process.env.SERVICE_BOOKING_FEE_CENTS);
  if (Number.isFinite(cents) && cents > 0) return Math.round(cents);

  const dollars = Number(process.env.SERVICE_BOOKING_FEE_DOLLARS);
  if (Number.isFinite(dollars) && dollars > 0) return toMinorUnits(dollars);

  return 10000;
}

export function getDealerPurchaseDepositCents(vehiclePrice?: number | null): number {
  if (Number.isFinite(vehiclePrice) && Number(vehiclePrice) > 0) {
    return getDealerPurchaseDepositCentsForPrice(Number(vehiclePrice));
  }

  const cents = Number(process.env.DEALER_PURCHASE_DEPOSIT_CENTS);
  if (Number.isFinite(cents) && cents > 0) return Math.round(cents);

  const dollars = Number(process.env.DEALER_PURCHASE_DEPOSIT_DOLLARS);
  if (Number.isFinite(dollars) && dollars > 0) return toMinorUnits(dollars);

  return 500000;
}

const paymentConfirmationRequestSelect = {
  id: true,
  publicTransactionToken: true,
  parties: {
    select: {
      partyType: true,
      name: true,
      email: true,
    },
  },
  partnerTokens: {
    select: {
      token: true,
    },
    take: 1,
  },
  vehicle: {
    select: {
      year: true,
      vin: true,
      model: {
        select: {
          name: true,
          make: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
};

const paidDealerPurchaseRequestSelect = {
  id: true,
  requestType: true,
  status: true,
  publicTransactionToken: true,
  packages: {
    select: {
      id: true,
      title: true,
      scope: true,
    },
    take: 1,
  },
  parties: {
    select: {
      partyType: true,
      name: true,
      email: true,
    },
  },
  partnerTokens: {
    select: {
      token: true,
    },
    take: 1,
  },
  vehicle: {
    select: {
      year: true,
      vin: true,
      model: {
        select: {
          name: true,
          make: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
};

const dealerPurchaseWebhookRequestSelect = {
  id: true,
  requestType: true,
  status: true,
  paymentStatus: true,
  fees: {
    select: {
      id: true,
      feeType: true,
    },
  },
  depositIntents: {
    select: {
      id: true,
      transactionRef: true,
    },
  },
  listing: {
    select: {
      askingPrice: true,
      price: true,
    },
  },
};

const serviceBookingWebhookRequestSelect = {
  id: true,
  requestType: true,
  status: true,
  paymentStatus: true,
  fees: {
    select: {
      id: true,
      feeType: true,
    },
  },
  depositIntents: {
    select: {
      id: true,
      transactionRef: true,
    },
  },
};

const webhookLookupRequestSelect = {
  id: true,
  status: true,
};

function parseProviderRef(transactionRef: string | null | undefined): { provider: PaymentProviderName; id: string } {
  if (!transactionRef) {
    return { provider: "ledger", id: `missing_${crypto.randomUUID()}` };
  }
  if (transactionRef.startsWith("stripe:")) {
    return { provider: "stripe", id: transactionRef.slice("stripe:".length) };
  }
  if (transactionRef.startsWith("stripe_checkout:")) {
    const paymentIntentId = transactionRef
      .split(";")
      .find((part) => part.startsWith("payment_intent:"))
      ?.slice("payment_intent:".length);
    if (paymentIntentId && paymentIntentId !== "unknown") {
      return { provider: "stripe", id: paymentIntentId };
    }
  }
  if (transactionRef.startsWith("ledger:")) {
    return { provider: "ledger", id: transactionRef.slice("ledger:".length) };
  }
  return { provider: "ledger", id: transactionRef };
}

function stripeSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe.");
  return secretKey;
}

async function stripeRequest<T>(path: string, body: URLSearchParams): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecretKey()}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const responseText = await response.text();
  let parsed: { id?: string; error?: { message?: string }; [key: string]: unknown } = {};
  if (responseText) {
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = { error: { message: responseText.slice(0, 500) } };
    }
  }

  if (!response.ok) {
    throw new Error(parsed.error?.message || `${response.status} ${response.statusText}`);
  }

  return parsed as T;
}

export async function createServiceBookingCheckoutSession(
  input: CreateServiceBookingCheckoutInput
): Promise<{ id: string; url: string; amountCents: number; currency: string }> {
  if (getPaymentProvider() !== "stripe") {
    throw new Error("PAYMENT_PROVIDER=stripe is required to create Stripe Checkout Sessions.");
  }

  const amountCents = input.amountCents;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("A valid service-booking fee amount is required.");
  }

  const currency = normalizeCurrency(input.currency);
  const baseUrl = appBaseUrl();
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${baseUrl}/transactions/${input.publicTransactionToken}?payment=success`);
  body.set("cancel_url", `${baseUrl}/transactions/${input.publicTransactionToken}?payment=cancelled`);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", currency);
  body.set("line_items[0][price_data][unit_amount]", String(amountCents));
  body.set("line_items[0][price_data][product_data][name]", "SUPERCAR DASH service booking fee");
  body.set("metadata[serviceBookingId]", input.fulfillmentRequestId);
  body.set("metadata[fulfillmentRequestId]", input.fulfillmentRequestId);
  body.set("metadata[vehicleId]", input.vehicleId);
  body.set("metadata[vin]", input.vin);
  body.set("metadata[ownerUserId]", input.ownerUserId);
  body.set("metadata[feeType]", "SERVICE_BOOKING");
  body.set("payment_intent_data[metadata][serviceBookingId]", input.fulfillmentRequestId);
  body.set("payment_intent_data[metadata][fulfillmentRequestId]", input.fulfillmentRequestId);
  body.set("payment_intent_data[metadata][feeType]", "SERVICE_BOOKING");

  const session = await stripeRequest<{ id: string; url?: string }>("/checkout/sessions", body);
  if (!session.url) throw new Error("Stripe Checkout Session did not return a redirect URL.");

  return { id: session.id, url: session.url, amountCents, currency };
}

export async function createDealerPurchaseCheckoutSession(
  input: CreateDealerPurchaseCheckoutInput
): Promise<{ id: string; url: string; amountCents: number; currency: string }> {
  if (getPaymentProvider() !== "stripe") {
    throw new Error("PAYMENT_PROVIDER=stripe is required to create Stripe Checkout Sessions.");
  }

  const amountCents = input.amountCents;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("A valid dealer-purchase deposit amount is required.");
  }

  const currency = normalizeCurrency(input.currency);
  const baseUrl = appBaseUrl();
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${baseUrl}/transactions/${input.publicTransactionToken}?deposit=success`);
  body.set("cancel_url", `${baseUrl}/transactions/${input.publicTransactionToken}?deposit=cancelled`);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", currency);
  body.set("line_items[0][price_data][unit_amount]", String(amountCents));
  body.set("line_items[0][price_data][product_data][name]", "SUPERCAR DASH purchase request deposit");
  body.set("payment_intent_data[capture_method]", "manual");
  body.set("metadata[dealerPurchaseId]", input.fulfillmentRequestId);
  body.set("metadata[fulfillmentRequestId]", input.fulfillmentRequestId);
  body.set("metadata[listingId]", input.listingId);
  body.set("metadata[vin]", input.vin);
  body.set("metadata[buyerUserId]", input.buyerUserId);
  body.set("metadata[feeType]", "DEALER_PURCHASE_DEPOSIT");
  body.set("payment_intent_data[metadata][dealerPurchaseId]", input.fulfillmentRequestId);
  body.set("payment_intent_data[metadata][fulfillmentRequestId]", input.fulfillmentRequestId);
  body.set("payment_intent_data[metadata][feeType]", "DEALER_PURCHASE_DEPOSIT");

  const session = await stripeRequest<{ id: string; url?: string }>("/checkout/sessions", body);
  if (!session.url) throw new Error("Stripe Checkout Session did not return a redirect URL.");

  return { id: session.id, url: session.url, amountCents, currency };
}

function assertStripePaymentMethod(paymentMethod: string | undefined): string {
  const method = paymentMethod?.trim();
  if (!method || isInternalLedgerHold(paymentMethod)) {
    throw new Error("A real Stripe payment method id is required for payment authorization.");
  }
  return method;
}

function isInternalLedgerHold(paymentMethod: string | undefined): boolean {
  const method = paymentMethod?.trim().toUpperCase();
  if (!method) return true;
  return method === "CREDIT_CARD_HOLD" || method.includes("LEDGER_AUTH");
}

export async function authorizeDeposit(input: AuthorizeDepositInput): Promise<PaymentOperationResult> {
  const provider = getPaymentProvider();
  if (provider === "ledger" || isInternalLedgerHold(input.paymentMethod)) {
    return {
      provider: "ledger",
      transactionRef: `ledger:auth_${crypto.randomUUID()}`,
    };
  }

  const body = new URLSearchParams();
  body.set("amount", String(toMinorUnits(input.amount)));
  body.set("currency", normalizeCurrency(input.currency));
  body.set("payment_method", assertStripePaymentMethod(input.paymentMethod));
  body.set("confirm", "true");
  body.set("capture_method", "manual");
  body.set("description", "SUPERCARS fulfillment refundable authorization hold");
  if (input.fulfillmentRequestId) body.set("metadata[fulfillmentRequestId]", input.fulfillmentRequestId);
  if (input.publicTransactionToken) body.set("metadata[publicTransactionToken]", input.publicTransactionToken);

  const paymentIntent = await stripeRequest<{ id: string }>("/payment_intents", body);
  return {
    provider,
    transactionRef: `stripe:${paymentIntent.id}`,
    providerActionId: paymentIntent.id,
  };
}

export async function captureDeposit(transactionRef: string, amount?: number): Promise<PaymentOperationResult> {
  const ref = parseProviderRef(transactionRef);
  if (ref.provider === "ledger") {
    return { provider: "ledger", transactionRef };
  }

  const body = new URLSearchParams();
  if (amount !== undefined) body.set("amount_to_capture", String(toMinorUnits(amount)));
  const paymentIntent = await stripeRequest<{ id: string }>(`/payment_intents/${ref.id}/capture`, body);
  return { provider: "stripe", transactionRef, providerActionId: paymentIntent.id };
}

export async function voidDeposit(transactionRef: string): Promise<PaymentOperationResult> {
  const ref = parseProviderRef(transactionRef);
  if (ref.provider === "ledger") {
    return { provider: "ledger", transactionRef };
  }

  const paymentIntent = await stripeRequest<{ id: string }>(`/payment_intents/${ref.id}/cancel`, new URLSearchParams());
  return { provider: "stripe", transactionRef, providerActionId: paymentIntent.id };
}

export async function refundDeposit(transactionRef: string, amount?: number): Promise<PaymentOperationResult> {
  const ref = parseProviderRef(transactionRef);
  if (ref.provider === "ledger") {
    return { provider: "ledger", transactionRef };
  }

  const body = new URLSearchParams();
  body.set("payment_intent", ref.id);
  if (amount !== undefined) body.set("amount", String(toMinorUnits(amount)));
  const refund = await stripeRequest<{ id: string }>("/refunds", body);
  return { provider: "stripe", transactionRef, providerActionId: refund.id };
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return false;

  const timestamp = signatureHeader
    .split(",")
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signature = signatureHeader
    .split(",")
    .find((part) => part.startsWith("v1="))
    ?.slice(3);

  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function stripeEventAlreadyProcessed(eventId: string | undefined) {
  if (!eventId) return Promise.resolve(false);
  return prisma.fulfillmentEvent
    .findFirst({
      where: {
        note: "Stripe webhook processed",
        metadata: { contains: `"stripeEventId":"${eventId}"` },
      },
      select: { id: true },
    })
    .then(Boolean);
}

async function sendServiceBookingPaymentConfirmations(fulfillmentRequestId: string) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id: fulfillmentRequestId },
    select: paymentConfirmationRequestSelect,
  });
  if (!req) return;

  const vehicleSummary = req.vehicle
    ? `${req.vehicle.year} ${req.vehicle.model.make.name} ${req.vehicle.model.name} (VIN: ${req.vehicle.vin})`
    : "Service Booking";
  const owner = req.parties.find((party) => party.partyType === "BUYER");
  const shop = req.parties.find((party) => party.partyType === "SERVICE_CENTER");

  const { sendFulfillmentEmail } = await import("@/lib/mail/mail-service");
  if (owner?.email) {
    await sendFulfillmentEmail({
      fulfillmentRequestId,
      templateType: "ACCEPTED_NOTIFICATION",
      recipientName: owner.name,
      recipientEmail: owner.email,
      packageTitle: "Service booking confirmed",
      vehicleSummary,
      reviewUrl: `/transactions/${req.publicTransactionToken}`,
    });
  }

  if (shop?.email) {
    await sendFulfillmentEmail({
      fulfillmentRequestId,
      templateType: "ACCEPTED_NOTIFICATION",
      recipientName: shop.name,
      recipientEmail: shop.email,
      packageTitle: "Owner payment received for service booking",
      vehicleSummary,
      reviewUrl: `/fulfillment/${req.partnerTokens?.[0]?.token || req.publicTransactionToken}`,
    });
  }
}

async function dispatchPaidDealerPurchaseRequest(fulfillmentRequestId: string) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id: fulfillmentRequestId },
    select: paidDealerPurchaseRequestSelect,
  });
  if (!req || req.requestType !== "DEALER_PURCHASE") return;

  const partnerToken = req.partnerTokens[0];
  const dealerParty = req.parties.find((party) => party.partyType === "DEALER" || party.partyType === "SELLER");
  const buyerParty = req.parties.find((party) => party.partyType === "BUYER");
  const packageRecord = req.packages[0];
  const vehicleSummary = req.vehicle
    ? `${req.vehicle.year} ${req.vehicle.model.make.name} ${req.vehicle.model.name} (VIN: ${req.vehicle.vin})`
    : "Dealer Purchase Request";
  const packageScope = parseJsonRecord(packageRecord?.scope);
  const decisionTokenUrl = partnerToken ? `/fulfillment/${partnerToken.token}` : `/transactions/${req.publicTransactionToken}`;

  if (partnerToken && packageRecord) {
    packageScope.decisionTokenUrl = decisionTokenUrl;
    packageScope.depositStatus = "AUTHORIZED_PENDING_DEALER_ACCEPTANCE";
    await prisma.fulfillmentPackage.update({
      where: { id: packageRecord.id },
      data: { scope: JSON.stringify(packageScope) },
    });
  }

  if (dealerParty?.email) {
    const { dispatchDealerPackageEmail } = await import("@/lib/fulfillment/dealer-package");
    const result = await dispatchDealerPackageEmail({
      fulfillmentRequestId,
      dealerName: dealerParty.name,
      dealerEmail: dealerParty.email,
      decisionTokenUrl,
      packageTitle: packageRecord?.title || "Dealer Purchase Package",
      vehicleSummary,
      askingPrice: numberFromScope(packageScope.askingPrice),
      buyerName: buyerParty?.name || "Verified Buyer",
      buyerPhone: typeof packageScope.buyerPhone === "string" ? packageScope.buyerPhone : undefined,
      platformFee: numberFromScope(packageScope.platformFee),
    });

    await prisma.fulfillmentRequest.update({
      where: { id: fulfillmentRequestId },
      data: { status: result.dispatched ? "SENT" : req.status },
    });
    return;
  }

  await prisma.fulfillmentEvent.create({
    data: {
      fulfillmentRequestId,
      previousStatus: req.status,
      newStatus: req.status,
      actorType: "SYSTEM",
      note: "Dealer purchase deposit authorized; dealer email unresolved and ready for admin follow-up.",
    },
  });
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function numberFromScope(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function processStripeWebhookPayload(payload: string): Promise<PaymentWebhookResult> {
  const event = JSON.parse(payload) as {
    id?: string;
    type?: string;
    data?: {
      object?: {
        id?: string;
        amount_total?: number;
        amount?: number;
        payment_intent?: string;
        metadata?: {
          dealerPurchaseId?: string;
          serviceBookingId?: string;
          fulfillmentRequestId?: string;
          publicTransactionToken?: string;
          feeType?: string;
        };
      };
    };
  };

  if (await stripeEventAlreadyProcessed(event.id)) {
    return { received: true, eventType: event.type || "unknown", fulfillmentRequestId: null, alreadyProcessed: true };
  }

  const eventType = event.type || "unknown";
  const object = event.data?.object;
  const fulfillmentRequestId = object?.metadata?.serviceBookingId || object?.metadata?.fulfillmentRequestId;
  const publicTransactionToken = object?.metadata?.publicTransactionToken;

  if (
    eventType === "checkout.session.completed" ||
    eventType === "checkout.session.async_payment_succeeded"
  ) {
    if (object?.metadata?.feeType === "DEALER_PURCHASE_DEPOSIT" && fulfillmentRequestId) {
      const req = await prisma.fulfillmentRequest.findUnique({
        where: { id: fulfillmentRequestId },
        select: dealerPurchaseWebhookRequestSelect,
      });
      if (!req || req.requestType !== "DEALER_PURCHASE") {
        return { received: true, eventType, fulfillmentRequestId: null };
      }

      const listingAmount = req.listing?.askingPrice ?? req.listing?.price ?? 0;
      const expectedCents = getDealerPurchaseDepositCents(listingAmount);
      if (object.amount_total !== expectedCents) {
        throw new Error("Stripe Checkout amount did not match configured dealer-purchase deposit.");
      }

      const metadata = JSON.stringify({
        stripeEventId: event.id || null,
        stripeSessionId: object.id,
        stripePaymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : null,
        amountCents: object.amount_total,
        captureMethod: "manual",
      });

      if (req.paymentStatus === "AUTHORIZED" || req.paymentStatus === "PAID") {
        await prisma.fulfillmentEvent.create({
          data: {
            fulfillmentRequestId: req.id,
            previousStatus: req.status,
            newStatus: req.status,
            actorType: "SYSTEM",
            note: "Stripe webhook processed",
            metadata,
          },
        });
        return { received: true, eventType, fulfillmentRequestId: req.id, alreadyProcessed: true };
      }

      await prisma.$transaction(async (tx) => {
        await tx.fulfillmentRequest.update({
          where: { id: req.id },
          data: {
            paymentStatus: "AUTHORIZED",
            collectedAmount: 0,
            refundableAmount: expectedCents / 100,
          },
        });

        for (const fee of req.fees.filter((fee) => fee.feeType === "DEPOSIT")) {
          await tx.fulfillmentFee.update({
            where: { id: fee.id },
            data: { status: "AUTHORIZED" },
          });
        }

        const checkoutIntent = req.depositIntents.find((deposit) => deposit.transactionRef === `stripe_checkout:${object.id}`);
        if (checkoutIntent) {
          await tx.depositIntent.update({
            where: { id: checkoutIntent.id },
            data: {
              status: "AUTHORIZED",
              transactionRef: `stripe_checkout:${object.id};payment_intent:${object.payment_intent || "unknown"}`,
            },
          });
        }

        await tx.fulfillmentEvent.create({
          data: {
            fulfillmentRequestId: req.id,
            previousStatus: req.status,
            newStatus: req.status,
            actorType: "SYSTEM",
            note: "Stripe Checkout authorized dealer-purchase deposit for manual capture after dealer acceptance",
            metadata,
          },
        });
      });

      await dispatchPaidDealerPurchaseRequest(req.id);
      return { received: true, eventType, fulfillmentRequestId: req.id };
    }

    if (object?.metadata?.feeType !== "SERVICE_BOOKING" || !fulfillmentRequestId) {
      return { received: true, eventType, fulfillmentRequestId: null };
    }

    const expectedCents = getServiceBookingFeeCents();
    if (object.amount_total !== expectedCents) {
      throw new Error("Stripe Checkout amount did not match configured service-booking fee.");
    }

    const req = await prisma.fulfillmentRequest.findUnique({
      where: { id: fulfillmentRequestId },
      select: serviceBookingWebhookRequestSelect,
    });
    if (!req || req.requestType !== "SERVICE_BOOKING") {
      return { received: true, eventType, fulfillmentRequestId: null };
    }

    const metadata = JSON.stringify({
      stripeEventId: event.id || null,
      stripeSessionId: object.id,
      stripePaymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : null,
      amountCents: object.amount_total,
    });

    if (req.status === "CONFIRMED" || req.paymentStatus === "PAID") {
      await prisma.fulfillmentEvent.create({
        data: {
          fulfillmentRequestId: req.id,
          previousStatus: req.status,
          newStatus: req.status,
          actorType: "SYSTEM",
          note: "Stripe webhook processed",
          metadata,
        },
      });
      return { received: true, eventType, fulfillmentRequestId: req.id, alreadyProcessed: true };
    }

    await prisma.$transaction(async (tx) => {
      await tx.fulfillmentRequest.update({
        where: { id: req.id },
        data: {
          status: "CONFIRMED",
          paymentStatus: "PAID",
          collectedAmount: expectedCents / 100,
          payoutStatus: "UNSETTLED",
        },
      });

      for (const fee of req.fees.filter((fee) => fee.feeType === "SERVICE_FEE")) {
        await tx.fulfillmentFee.update({
          where: { id: fee.id },
          data: { status: "CAPTURED" },
        });
      }

      const checkoutIntent = req.depositIntents.find((deposit) => deposit.transactionRef === `stripe_checkout:${object.id}`);
      if (checkoutIntent) {
        await tx.depositIntent.update({
          where: { id: checkoutIntent.id },
          data: {
            status: "CAPTURED",
            capturedAt: new Date(),
            transactionRef: `stripe_checkout:${object.id};payment_intent:${object.payment_intent || "unknown"}`,
          },
        });
      }

      await tx.fulfillmentEvent.create({
        data: {
          fulfillmentRequestId: req.id,
          previousStatus: req.status,
          newStatus: "CONFIRMED",
          actorType: "SYSTEM",
          note: "Stripe webhook processed",
          metadata,
        },
      });
    });

    await sendServiceBookingPaymentConfirmations(req.id);
    return { received: true, eventType, fulfillmentRequestId: req.id };
  }

  if (
    eventType === "checkout.session.async_payment_failed" ||
    eventType === "payment_intent.payment_failed"
  ) {
    const requestId = fulfillmentRequestId;
    if (requestId) {
      await prisma.fulfillmentRequest.updateMany({
        where: {
          id: requestId,
          requestType: { in: ["SERVICE_BOOKING", "DEALER_PURCHASE"] },
        },
        data: object?.metadata?.feeType === "DEALER_PURCHASE_DEPOSIT"
          ? { paymentStatus: "FAILED" }
          : { paymentStatus: "FAILED", status: "ACCEPTED_AWAITING_PAYMENT" },
      });
      await prisma.fulfillmentEvent.create({
        data: {
          fulfillmentRequestId: requestId,
          previousStatus: "PAYMENT_PROCESSING",
          newStatus: "ACCEPTED_AWAITING_PAYMENT",
          actorType: "SYSTEM",
          note: "Stripe webhook processed",
          metadata: JSON.stringify({ stripeEventId: event.id || null, eventType, stripeObjectId: object?.id || null }),
        },
      });
      return { received: true, eventType, fulfillmentRequestId: requestId };
    }
  }

  const request = fulfillmentRequestId
    ? await prisma.fulfillmentRequest.findUnique({ where: { id: fulfillmentRequestId }, select: webhookLookupRequestSelect })
    : publicTransactionToken
      ? await prisma.fulfillmentRequest.findUnique({ where: { publicTransactionToken }, select: webhookLookupRequestSelect })
      : object?.id
        ? await prisma.fulfillmentRequest.findFirst({
            where: { depositIntents: { some: { transactionRef: `stripe:${object.id}` } } },
            select: webhookLookupRequestSelect,
          })
        : null;

  if (!request) {
    return { received: true, eventType, fulfillmentRequestId: null };
  }

  await prisma.fulfillmentEvent.create({
    data: {
      fulfillmentRequestId: request.id,
      previousStatus: request.status,
      newStatus: request.status,
      actorType: "SYSTEM",
      note: `Stripe webhook received: ${eventType}`,
      metadata: payload.slice(0, 4000),
    },
  });

  if (eventType === "payment_intent.payment_failed") {
    await prisma.fulfillmentRequest.update({
      where: { id: request.id },
      data: { paymentStatus: "FAILED" },
    });
  }

  return { received: true, eventType, fulfillmentRequestId: request.id };
}
