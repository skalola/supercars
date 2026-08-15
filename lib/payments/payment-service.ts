/**
 * lib/payments/payment-service.ts
 *
 * Sprint 8B payment provider boundary.
 *
 * Local development defaults to the internal ledger provider. Production can use
 * Stripe PaymentIntents with manual capture by setting PAYMENT_PROVIDER=stripe.
 */

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDealerPurchaseDepositCentsForPrice } from "@/lib/pricing/dealer-purchase-fees";
import { resolvePaymentProvider } from "@/lib/operations/runtime-provider-policy";

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
  return resolvePaymentProvider(process.env.PAYMENT_PROVIDER);
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

export function getServiceBookingCheckoutKey(fulfillmentRequestId: string, amountCents: number): string {
  return `scd:service:${fulfillmentRequestId}:${amountCents}:v2-manual-capture`;
}

export function getDealerPurchaseCheckoutKey(fulfillmentRequestId: string, amountCents: number): string {
  return `scd:purchase:${fulfillmentRequestId}:${amountCents}:v1`;
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

const paidServiceBookingRequestSelect = {
  id: true,
  requestType: true,
  status: true,
  publicTransactionToken: true,
  packages: {
    select: {
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
      phone: true,
    },
  },
  partnerTokens: {
    select: { token: true },
    take: 1,
  },
  vehicle: {
    select: {
      year: true,
      vin: true,
      model: {
        select: {
          name: true,
          make: { select: { name: true } },
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

async function stripeRequest<T>(
  path: string,
  body: URLSearchParams,
  options?: { idempotencyKey?: string }
): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${stripeSecretKey()}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  if (options?.idempotencyKey) {
    headers["idempotency-key"] = options.idempotencyKey;
  }

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers,
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
): Promise<{
  id: string;
  url: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  expiresAt: Date;
}> {
  if (getPaymentProvider() !== "stripe") {
    throw new Error("PAYMENT_PROVIDER=stripe is required to create Stripe Checkout Sessions.");
  }

  const { body, amountCents, currency } = buildServiceBookingCheckoutParams(input);
  const idempotencyKey = getServiceBookingCheckoutKey(input.fulfillmentRequestId, amountCents);
  const session = await stripeRequest<{ id: string; url?: string; expires_at?: number }>(
    "/checkout/sessions",
    body,
    { idempotencyKey }
  );
  if (!session.url) throw new Error("Stripe Checkout Session did not return a redirect URL.");

  return {
    id: session.id,
    url: session.url,
    amountCents,
    currency,
    idempotencyKey,
    expiresAt: new Date((session.expires_at || Math.floor(Date.now() / 1000) + 30 * 60) * 1000),
  };
}

export function buildServiceBookingCheckoutParams(input: CreateServiceBookingCheckoutInput) {
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
  body.set("payment_intent_data[capture_method]", "manual");
  body.set("metadata[serviceBookingId]", input.fulfillmentRequestId);
  body.set("metadata[fulfillmentRequestId]", input.fulfillmentRequestId);
  body.set("metadata[vehicleId]", input.vehicleId);
  body.set("metadata[vin]", input.vin);
  body.set("metadata[ownerUserId]", input.ownerUserId);
  body.set("metadata[feeType]", "SERVICE_BOOKING");
  body.set("payment_intent_data[metadata][serviceBookingId]", input.fulfillmentRequestId);
  body.set("payment_intent_data[metadata][fulfillmentRequestId]", input.fulfillmentRequestId);
  body.set("payment_intent_data[metadata][feeType]", "SERVICE_BOOKING");

  return { body, amountCents, currency };
}

export async function createDealerPurchaseCheckoutSession(
  input: CreateDealerPurchaseCheckoutInput
): Promise<{
  id: string;
  url: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  expiresAt: Date;
}> {
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

  const idempotencyKey = getDealerPurchaseCheckoutKey(input.fulfillmentRequestId, amountCents);
  const session = await stripeRequest<{ id: string; url?: string; expires_at?: number }>(
    "/checkout/sessions",
    body,
    { idempotencyKey }
  );
  if (!session.url) throw new Error("Stripe Checkout Session did not return a redirect URL.");

  return {
    id: session.id,
    url: session.url,
    amountCents,
    currency,
    idempotencyKey,
    expiresAt: new Date((session.expires_at || Math.floor(Date.now() / 1000) + 30 * 60) * 1000),
  };
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

  const paymentIntent = await stripeRequest<{ id: string }>("/payment_intents", body, {
    idempotencyKey: input.fulfillmentRequestId
      ? `scd:authorize:${input.fulfillmentRequestId}:${toMinorUnits(input.amount)}:v1`
      : undefined,
  });
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
  const paymentIntent = await stripeRequest<{ id: string }>(`/payment_intents/${ref.id}/capture`, body, {
    idempotencyKey: `scd:capture:${ref.id}:${amount === undefined ? "all" : toMinorUnits(amount)}:v1`,
  });
  return { provider: "stripe", transactionRef, providerActionId: paymentIntent.id };
}

export async function voidDeposit(transactionRef: string): Promise<PaymentOperationResult> {
  const ref = parseProviderRef(transactionRef);
  if (ref.provider === "ledger") {
    return { provider: "ledger", transactionRef };
  }

  const paymentIntent = await stripeRequest<{ id: string }>(
    `/payment_intents/${ref.id}/cancel`,
    new URLSearchParams(),
    { idempotencyKey: `scd:void:${ref.id}:v1` }
  );
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
  const refund = await stripeRequest<{ id: string }>("/refunds", body, {
    idempotencyKey: `scd:refund:${ref.id}:${amount === undefined ? "all" : toMinorUnits(amount)}:v1`,
  });
  return { provider: "stripe", transactionRef, providerActionId: refund.id };
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production" && getPaymentProvider() !== "stripe";
  }
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
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60) {
    return false;
  }

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

type StripeWebhookEvent = {
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

async function claimStripeWebhookEvent(event: StripeWebhookEvent) {
  if (!event.id) throw new Error("Stripe webhook event is missing its provider event id.");

  try {
    const record = await prisma.paymentWebhookEvent.create({
      data: {
        provider: "STRIPE",
        eventId: event.id,
        eventType: event.type || "unknown",
      },
      select: { id: true },
    });
    return { recordId: record.id, alreadyProcessed: false, processing: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }

  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_eventId: { provider: "STRIPE", eventId: event.id } },
    select: { id: true, status: true, updatedAt: true },
  });
  if (!existing) throw new Error("Stripe webhook idempotency record could not be loaded.");
  if (existing.status === "PROCESSED") {
    return { recordId: existing.id, alreadyProcessed: true, processing: false };
  }

  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
  const canRetry = existing.status === "FAILED" || existing.updatedAt < staleBefore;
  if (!canRetry) {
    return { recordId: existing.id, alreadyProcessed: false, processing: true };
  }

  const claimed = await prisma.paymentWebhookEvent.updateMany({
    where: {
      id: existing.id,
      status: existing.status,
      updatedAt: existing.updatedAt,
    },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      errorMessage: null,
      processedAt: null,
    },
  });
  return {
    recordId: existing.id,
    alreadyProcessed: false,
    processing: claimed.count === 0,
  };
}

async function dispatchAuthorizedServiceBookingRequest(fulfillmentRequestId: string) {
  const req = await prisma.fulfillmentRequest.findUnique({
    where: { id: fulfillmentRequestId },
    select: paidServiceBookingRequestSelect,
  });
  if (!req || req.requestType !== "SERVICE_BOOKING") return;

  const vehicleSummary = req.vehicle
    ? `${req.vehicle.year} ${req.vehicle.model.make.name} ${req.vehicle.model.name} (VIN: ${req.vehicle.vin})`
    : "Service Booking";
  const owner = req.parties.find((party) => party.partyType === "BUYER");
  const shop = req.parties.find((party) => party.partyType === "SERVICE_CENTER");
  const packageRecord = req.packages[0];
  const packageScope = parseJsonRecord(packageRecord?.scope);
  const customerContact = parseUnknownRecord(packageScope.customerContact);
  const decisionTokenUrl = req.partnerTokens[0]
    ? `/fulfillment/${req.partnerTokens[0].token}`
    : `/transactions/${req.publicTransactionToken}`;
  let dispatched = false;

  if (shop?.email) {
    const { dispatchServiceBookingEmail } = await import("@/lib/fulfillment/service-booking-package");
    const result = await dispatchServiceBookingEmail({
      fulfillmentRequestId,
      shopName: shop.name,
      shopEmail: shop.email,
      decisionTokenUrl,
      packageTitle: packageRecord?.title || "Service Booking Request",
      vehicleSummary,
      serviceName: typeof packageScope.serviceRequested === "string" ? packageScope.serviceRequested : undefined,
      customerName: owner?.name,
      customerPhone: typeof customerContact.phone === "string" ? customerContact.phone : owner?.phone || undefined,
      depositAmount: getServiceBookingFeeCents() / 100,
    });
    dispatched = result.dispatched;
  }

  await prisma.fulfillmentRequest.update({
    where: { id: fulfillmentRequestId },
    data: { status: dispatched ? "SENT" : "DRAFT" },
  });

  const { sendFulfillmentEmail } = await import("@/lib/mail/mail-service");
  if (owner?.email) {
    await sendFulfillmentEmail({
      fulfillmentRequestId,
      templateType: "BUYER_CONFIRMATION",
      recipientName: owner.name,
      recipientEmail: owner.email,
      packageTitle: dispatched ? "Service booking request sent" : "Service booking authorization received",
      vehicleSummary,
      reviewUrl: `/transactions/${req.publicTransactionToken}`,
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

function parseUnknownRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberFromScope(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function processStripeWebhookEvent(
  event: StripeWebhookEvent,
  payload: string
): Promise<PaymentWebhookResult> {
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
      if (req.status === "READY_TO_SEND" || req.status === "DRAFT" || req.status === "PAYMENT_PROCESSING") {
        await dispatchAuthorizedServiceBookingRequest(req.id);
      }
      return { received: true, eventType, fulfillmentRequestId: req.id, alreadyProcessed: true };
    }

    await prisma.$transaction(async (tx) => {
      await tx.fulfillmentRequest.update({
        where: { id: req.id },
        data: {
          status: "READY_TO_SEND",
          paymentStatus: "AUTHORIZED",
          collectedAmount: 0,
          refundableAmount: expectedCents / 100,
          payoutStatus: "UNSETTLED",
        },
      });

      for (const fee of req.fees.filter((fee) => fee.feeType === "SERVICE_FEE")) {
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
          newStatus: "READY_TO_SEND",
          actorType: "SYSTEM",
          note: "Stripe Checkout authorized service-booking fee for capture after shop acceptance",
          metadata: JSON.stringify({
            stripeEventId: event.id || null,
            stripeSessionId: object.id,
            stripePaymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : null,
            amountCents: object.amount_total,
            captureMethod: "manual",
          }),
        },
      });
    });

    await dispatchAuthorizedServiceBookingRequest(req.id);
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
          : { paymentStatus: "FAILED", status: "READY_TO_SEND" },
      });
      await prisma.fulfillmentEvent.create({
        data: {
          fulfillmentRequestId: requestId,
          previousStatus: "PAYMENT_PROCESSING",
          newStatus: object?.metadata?.feeType === "DEALER_PURCHASE_DEPOSIT" ? "PAYMENT_PROCESSING" : "READY_TO_SEND",
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

export async function processStripeWebhookPayload(payload: string): Promise<PaymentWebhookResult> {
  const event = JSON.parse(payload) as StripeWebhookEvent;
  const claim = await claimStripeWebhookEvent(event);
  if (claim.processing) {
    throw new Error("Stripe webhook event is already being processed; retry later.");
  }
  if (claim.alreadyProcessed) {
    return {
      received: true,
      eventType: event.type || "unknown",
      fulfillmentRequestId: null,
      alreadyProcessed: true,
    };
  }

  try {
    const result = await processStripeWebhookEvent(event, payload);
    await prisma.paymentWebhookEvent.update({
      where: { id: claim.recordId },
      data: {
        status: "PROCESSED",
        fulfillmentRequestId: result.fulfillmentRequestId || null,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook processing failed.";
    await prisma.paymentWebhookEvent.update({
      where: { id: claim.recordId },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 1000),
      },
    });
    throw error;
  }
}
