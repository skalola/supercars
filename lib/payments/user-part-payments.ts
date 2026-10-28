import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { stripeConnectRequest } from "@/lib/payments/stripe-connect";
import { buildUserPartCheckoutContract } from "@/lib/payments/user-part-checkout-contract";
import { sendUserPartOrderNotice } from "@/lib/mail/user-part-order-email";
import {
  getUserPartDisputeOrderStatus,
  isTerminalUserPartDisputeStatus,
  isUserPartDisputeEvent,
} from "@/lib/parts/user-part-dispute-policy";

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function createUserPartCheckoutSession(input: {
  orderId: string;
  listingTitle: string;
  connectedAccountId: string;
  itemAmountCents: number;
  shippingAmountCents: number;
  platformFeeCents: number;
  totalAmountCents: number;
  buyerId: string;
  buyerEmail: string | null;
  sellerId: string;
  listingId: string;
  collectShippingAddress: boolean;
}) {
  const baseUrl = appBaseUrl();
  const contract = buildUserPartCheckoutContract({ ...input, baseUrl });
  const session = await stripeConnectRequest<{ id: string; url?: string; expires_at?: number }>(
    "/checkout/sessions",
    {
      method: "POST",
      body: contract.body,
      connectedAccountId: input.connectedAccountId,
      idempotencyKey: contract.idempotencyKey,
    },
  );
  if (!session.url) throw new Error("Stripe Checkout did not return a payment URL.");
  return {
    id: session.id,
    url: session.url,
    checkoutKey: contract.idempotencyKey,
    expiresAt: new Date((session.expires_at || Math.floor(Date.now() / 1000) + 30 * 60) * 1000),
  };
}

export async function refundUserPartOrderPayment(input: {
  orderId: string;
  paymentIntentId: string;
  connectedAccountId: string;
}) {
  const body = new URLSearchParams();
  body.set("payment_intent", input.paymentIntentId);
  body.set("refund_application_fee", "true");
  body.set("metadata[userPartOrderId]", input.orderId);
  body.set("metadata[commerceType]", "USER_PART_SALE");
  return stripeConnectRequest<{ id: string; status?: string }>("/refunds", {
    method: "POST",
    body,
    connectedAccountId: input.connectedAccountId,
    idempotencyKey: `scd:user-part-refund:${input.orderId}:v1`,
  });
}

export type UserPartStripeEvent = {
  type?: string;
  account?: string;
  data?: {
    object?: {
      id?: string;
      amount_total?: number;
      amount_refunded?: number;
      charge?: string;
      payment_intent?: string;
      payment_status?: string;
      status?: string;
      reason?: string;
      metadata?: { userPartOrderId?: string; commerceType?: string };
      customer_details?: { email?: string | null; name?: string | null } | null;
      shipping_details?: { name?: string | null; address?: Record<string, unknown> | null } | null;
      collected_information?: { shipping_details?: { name?: string | null; address?: Record<string, unknown> | null } | null } | null;
    };
  };
};

export async function processUserPartStripeEvent(event: UserPartStripeEvent, resolvedOrderId?: string) {
  const object = event.data?.object;
  const orderId = resolvedOrderId || object?.metadata?.userPartOrderId;
  if (!orderId) return null;
  if (!resolvedOrderId && object?.metadata?.commerceType !== "USER_PART_SALE") return null;

  const order = await prisma.userPartOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      listingId: true,
      quantity: true,
      totalAmountCents: true,
      connectedAccountId: true,
      paymentIntentId: true,
      disputeId: true,
      disputeStatus: true,
      preDisputeStatus: true,
      buyer: { select: { name: true, email: true } },
      seller: { select: { name: true, email: true } },
      listing: { select: { quantity: true, status: true, title: true } },
    },
  });
  if (!order) throw new Error("Stripe referenced an unknown user-part order.");
  if (event.account !== order.connectedAccountId) throw new Error("Stripe connected-account mismatch for user-part order.");

  const eventType = event.type || "unknown";
  if (isUserPartDisputeEvent(eventType)) {
    if (object?.payment_intent && order.paymentIntentId && object.payment_intent !== order.paymentIntentId) {
      throw new Error("Stripe dispute PaymentIntent mismatch for user-part order.");
    }
    if (order.disputeId && object?.id && order.disputeId !== object.id) {
      throw new Error("Stripe dispute id mismatch for user-part order.");
    }

    const disputeStatus = object?.status || order.disputeStatus || "unknown";
    const previousOrderStatus = order.preDisputeStatus || order.status;
    const nextStatus = getUserPartDisputeOrderStatus({ eventType, disputeStatus, previousOrderStatus });
    const terminal = isTerminalUserPartDisputeStatus(disputeStatus)
      || eventType === "charge.dispute.funds_reinstated";

    await prisma.userPartOrder.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        disputeId: object?.id || order.disputeId,
        disputeStatus,
        disputeReason: object?.reason || undefined,
        preDisputeStatus: order.preDisputeStatus || order.status,
        disputedAt: order.disputeId ? undefined : new Date(),
        disputeResolvedAt: terminal ? new Date() : null,
      },
    });

    const outcome = nextStatus === "DISPUTED"
      ? "A payment dispute was opened. Fulfillment actions are paused while Stripe reviews it."
      : nextStatus === "CHARGEBACK"
        ? "Stripe closed the payment dispute in the buyer's favor. The order is recorded as a chargeback."
        : "Stripe resolved the payment dispute in the seller's favor. The order has returned to its prior state.";
    await Promise.allSettled([
      sendUserPartOrderNotice({
        recipientEmail: order.seller.email,
        recipientName: order.seller.name || "Seller",
        subject: `Payment dispute update: ${order.listing.title}`,
        heading: "Payment dispute update",
        message: outcome,
        orderId: order.id,
      }),
      sendUserPartOrderNotice({
        recipientEmail: order.buyer.email,
        recipientName: order.buyer.name || "Buyer",
        subject: `Payment dispute update: ${order.listing.title}`,
        heading: "Payment dispute update",
        message: outcome,
        orderId: order.id,
      }),
    ]);
    return { orderId: order.id, processed: true };
  }

  if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
    if (object?.amount_total !== order.totalAmountCents) throw new Error("Stripe order amount did not match the reserved total.");
    if (object.payment_status && object.payment_status !== "paid" && object.payment_status !== "no_payment_required") {
      return { orderId: order.id, processed: false };
    }
    if (["PAID", "FULFILLED", "COMPLETED", "REFUND_PENDING", "REFUNDED"].includes(order.status)) {
      return { orderId: order.id, processed: true };
    }
    const shipping = object.collected_information?.shipping_details || object.shipping_details;
    await prisma.$transaction(async (transaction) => {
      await transaction.userPartOrder.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : null,
          buyerEmail: object.customer_details?.email || undefined,
          buyerName: object.customer_details?.name || undefined,
          shippingName: shipping?.name || undefined,
          shippingAddress: shipping?.address
            ? JSON.parse(JSON.stringify(shipping.address)) as Prisma.InputJsonValue
            : undefined,
          paidAt: new Date(),
        },
      });
      if (order.listing.quantity > order.quantity) {
        await transaction.userPartListing.update({
          where: { id: order.listingId },
          data: { quantity: { decrement: order.quantity }, status: "ACTIVE" },
        });
      } else {
        await transaction.userPartListing.update({
          where: { id: order.listingId },
          data: { quantity: 0, status: "SOLD", soldAt: new Date() },
        });
      }
    });
    await Promise.allSettled([
      sendUserPartOrderNotice({
        recipientEmail: order.seller.email,
        recipientName: order.seller.name || "Seller",
        subject: `New paid order: ${order.listing.title}`,
        heading: "You have a paid parts order",
        message: `A buyer paid for ${order.listing.title}. Open the transaction to review delivery details and fulfill the order.`,
        orderId: order.id,
      }),
      sendUserPartOrderNotice({
        recipientEmail: order.buyer.email,
        recipientName: order.buyer.name || "Buyer",
        subject: `Payment confirmed: ${order.listing.title}`,
        heading: "Your payment is confirmed",
        message: `Your payment for ${order.listing.title} was confirmed. The seller can now fulfill the order.`,
        orderId: order.id,
      }),
    ]);
    return { orderId: order.id, processed: true };
  }

  if (eventType === "checkout.session.expired" || eventType === "checkout.session.async_payment_failed") {
    if (order.status !== "CHECKOUT_PENDING") return { orderId: order.id, processed: true };
    await prisma.$transaction([
      prisma.userPartOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } }),
      prisma.userPartListing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } }),
    ]);
    return { orderId: order.id, processed: true };
  }

  if (eventType === "charge.refunded" && Number(object?.amount_refunded || 0) >= order.totalAmountCents) {
    const refunded = await prisma.userPartOrder.updateMany({
      where: { id: order.id, status: { in: ["PAID", "FULFILLED", "REFUND_PENDING"] } },
      data: { status: "REFUNDED", refundedAt: new Date() },
    });
    if (refunded.count === 1) {
      await sendUserPartOrderNotice({
        recipientEmail: order.buyer.email,
        recipientName: order.buyer.name || "Buyer",
        subject: `Refund confirmed: ${order.listing.title}`,
        heading: "Your refund was confirmed",
        message: `Stripe confirmed the refund for ${order.listing.title}. Your bank will return the funds to the original payment method according to its processing time.`,
        orderId: order.id,
      });
    }
    return { orderId: order.id, processed: true };
  }

  return { orderId: order.id, processed: false };
}
