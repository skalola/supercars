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

function parseProviderRef(transactionRef: string | null | undefined): { provider: PaymentProviderName; id: string } {
  if (!transactionRef) {
    return { provider: "ledger", id: `missing_${crypto.randomUUID()}` };
  }
  if (transactionRef.startsWith("stripe:")) {
    return { provider: "stripe", id: transactionRef.slice("stripe:".length) };
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

export async function processStripeWebhookPayload(payload: string): Promise<PaymentWebhookResult> {
  const event = JSON.parse(payload) as {
    type?: string;
    data?: {
      object?: {
        id?: string;
        metadata?: {
          fulfillmentRequestId?: string;
          publicTransactionToken?: string;
        };
      };
    };
  };

  const eventType = event.type || "unknown";
  const object = event.data?.object;
  const fulfillmentRequestId = object?.metadata?.fulfillmentRequestId;
  const publicTransactionToken = object?.metadata?.publicTransactionToken;

  const request = fulfillmentRequestId
    ? await prisma.fulfillmentRequest.findUnique({ where: { id: fulfillmentRequestId } })
    : publicTransactionToken
      ? await prisma.fulfillmentRequest.findUnique({ where: { publicTransactionToken } })
      : object?.id
        ? await prisma.fulfillmentRequest.findFirst({
            where: { depositIntents: { some: { transactionRef: `stripe:${object.id}` } } },
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
