"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { sendUserPartOrderNotice } from "@/lib/mail/user-part-order-email";
import {
  canBuyerCompleteUserPartOrder,
  canSellerFulfillUserPartOrder,
  canSellerRefundUserPartOrder,
  normalizeTrackingUrl,
} from "@/lib/payments/user-part-order-policy";
import { refundUserPartOrderPayment } from "@/lib/payments/user-part-payments";
import { prisma } from "@/lib/prisma";
import { enforceActionRateLimit } from "@/lib/security/action-rate-limit";
import { databaseIdSchema } from "@/lib/validation/common-inputs";
import { canReportUserPartOrderIssue, normalizeOrderIssueDescription, USER_PART_ORDER_ISSUE_TYPES, type UserPartOrderIssueType } from "@/lib/parts/user-part-order-issue-policy";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Sign in to manage this transaction.");
  return session.user.id;
}

function cleanText(value: FormDataEntryValue | null, max: number) {
  const result = typeof value === "string" ? value.trim() : "";
  return result ? result.slice(0, max) : null;
}

async function loadOrder(orderId: string) {
  return prisma.userPartOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true, sellerId: true, buyerId: true, paymentIntentId: true,
      connectedAccountId: true, listing: { select: { title: true } },
      buyer: { select: { name: true, email: true } },
      seller: { select: { name: true, email: true } },
    },
  });
}

function refresh(orderId: string) {
  revalidatePath(`/parts/orders/${orderId}`);
  revalidatePath("/transactions");
}

export async function fulfillUserPartOrderAction(orderId: string, formData: FormData) {
  try {
    const userId = await requireUser();
    orderId = databaseIdSchema.parse(orderId);
    await enforceActionRateLimit({ actorId: userId, action: "user_part_order_fulfill", bucketKey: orderId, limit: 8, windowMs: 60 * 60 * 1000 });
    const order = await loadOrder(orderId);
    if (!order || order.sellerId !== userId) throw new Error("Only the seller can fulfill this order.");
    if (!canSellerFulfillUserPartOrder(order.status)) throw new Error("This order is not ready for fulfillment.");
    const trackingUrl = normalizeTrackingUrl(cleanText(formData.get("trackingUrl"), 500));
    const updated = await prisma.userPartOrder.updateMany({
      where: { id: order.id, sellerId: userId, status: "PAID" },
      data: {
        status: "FULFILLED",
        fulfilledAt: new Date(),
        shippingCarrier: cleanText(formData.get("shippingCarrier"), 80),
        trackingNumber: cleanText(formData.get("trackingNumber"), 120),
        trackingUrl,
        sellerNote: cleanText(formData.get("sellerNote"), 500),
      },
    });
    if (updated.count !== 1) throw new Error("The order changed before fulfillment was saved. Refresh and try again.");
    refresh(order.id);
    await sendUserPartOrderNotice({ recipientEmail: order.buyer.email, recipientName: order.buyer.name || "Buyer", subject: `Your ${order.listing.title} order was fulfilled`, heading: "Your part is on the way", message: `The seller marked ${order.listing.title} as fulfilled. Open the transaction for tracking and delivery details.`, orderId: order.id }).catch(() => undefined);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not fulfill this order." };
  }
}

export async function completeUserPartOrderAction(orderId: string) {
  try {
    const userId = await requireUser();
    orderId = databaseIdSchema.parse(orderId);
    const order = await loadOrder(orderId);
    if (!order || order.buyerId !== userId) throw new Error("Only the buyer can confirm receipt.");
    if (!canBuyerCompleteUserPartOrder(order.status)) throw new Error("This order cannot be completed yet.");
    const updated = await prisma.userPartOrder.updateMany({ where: { id: order.id, buyerId: userId, status: "FULFILLED" }, data: { status: "COMPLETED", completedAt: new Date() } });
    if (updated.count !== 1) throw new Error("The order changed before receipt was confirmed.");
    refresh(order.id);
    await sendUserPartOrderNotice({ recipientEmail: order.seller.email, recipientName: order.seller.name || "Seller", subject: `Order complete: ${order.listing.title}`, heading: "Buyer confirmed receipt", message: `The buyer confirmed receipt of ${order.listing.title}. This transaction is now complete.`, orderId: order.id }).catch(() => undefined);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not complete this order." };
  }
}

export async function refundUserPartOrderAction(orderId: string) {
  let lockedStatus: string | null = null;
  try {
    const userId = await requireUser();
    orderId = databaseIdSchema.parse(orderId);
    await enforceActionRateLimit({ actorId: userId, action: "user_part_order_refund", bucketKey: orderId, limit: 4, windowMs: 60 * 60 * 1000 });
    const order = await loadOrder(orderId);
    if (!order || order.sellerId !== userId) throw new Error("Only the seller can refund this order.");
    if (!canSellerRefundUserPartOrder(order.status)) throw new Error("This order is not eligible for a refund.");
    if (!order.paymentIntentId) throw new Error("The Stripe payment reference is unavailable.");
    lockedStatus = order.status;
    const lock = await prisma.userPartOrder.updateMany({ where: { id: order.id, sellerId: userId, status: order.status }, data: { status: "REFUND_PENDING" } });
    if (lock.count !== 1) throw new Error("A refund or order update is already in progress.");
    const refund = await refundUserPartOrderPayment({ orderId: order.id, paymentIntentId: order.paymentIntentId, connectedAccountId: order.connectedAccountId });
    if (refund.status === "failed" || refund.status === "canceled") {
      throw new Error("Stripe did not accept this refund. Try again or review it in Stripe.");
    }
    const refundConfirmed = refund.status === "succeeded";
    if (refundConfirmed) {
      await prisma.userPartOrder.update({ where: { id: order.id }, data: { status: "REFUNDED", refundedAt: new Date() } });
    }
    refresh(order.id);
    await sendUserPartOrderNotice({
      recipientEmail: order.buyer.email,
      recipientName: order.buyer.name || "Buyer",
      subject: `${refundConfirmed ? "Refund issued" : "Refund submitted"}: ${order.listing.title}`,
      heading: refundConfirmed ? "Your refund was issued" : "Your refund is processing",
      message: refundConfirmed
        ? `The seller refunded your payment for ${order.listing.title}. Stripe will return the funds to the original payment method according to your bank's timing.`
        : `The seller submitted a refund for ${order.listing.title}. You will receive another update after Stripe confirms it.`,
      orderId: order.id,
    }).catch(() => undefined);
    return { ok: true as const };
  } catch (error) {
    if (lockedStatus && orderId) {
      await prisma.userPartOrder.updateMany({ where: { id: orderId, status: "REFUND_PENDING" }, data: { status: lockedStatus } }).catch(() => undefined);
    }
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not refund this order." };
  }
}

export async function reportUserPartOrderIssueAction(orderId: string, input: { issueType: UserPartOrderIssueType; description: string }) {
  try {
    const userId = await requireUser();
    orderId = databaseIdSchema.parse(orderId);
    if (!USER_PART_ORDER_ISSUE_TYPES.includes(input.issueType)) throw new Error("Choose a valid issue type.");
    const description = normalizeOrderIssueDescription(input.description);
    await enforceActionRateLimit({ actorId: userId, action: "user_part_order_issue", bucketKey: orderId, limit: 3, windowMs: 24 * 60 * 60 * 1000 });
    const order = await prisma.userPartOrder.findFirst({ where: { id: orderId, OR: [{ buyerId: userId }, { sellerId: userId }] }, select: { id: true, status: true } });
    if (!order) throw new Error("Transaction not found.");
    if (!canReportUserPartOrderIssue(order.status)) throw new Error("Issues can be reported only after payment is confirmed.");
    const existing = await prisma.userPartOrderIssue.findUnique({ where: { orderId_reporterId: { orderId, reporterId: userId } }, select: { status: true } });
    if (existing) throw new Error(`You already reported an issue for this order (${existing.status.toLowerCase()}).`);
    await prisma.userPartOrderIssue.create({ data: { orderId, reporterId: userId, issueType: input.issueType, description } });
    refresh(orderId);
    revalidatePath("/admin/parts");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not report this issue." };
  }
}
