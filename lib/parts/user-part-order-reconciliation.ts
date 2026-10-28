import "server-only";

import { sendUserPartOrderNotice } from "@/lib/mail/user-part-order-email";
import { prisma } from "@/lib/prisma";
import { getUserPartReconciliationCutoffs, USER_PART_RECONCILIATION_LIMITS } from "@/lib/parts/user-part-order-reconciliation-policy";

export async function reconcileUserPartOrders(now = new Date()) {
  const expired = await prisma.userPartOrder.findMany({
    where: { status: "CHECKOUT_PENDING", checkoutExpiresAt: { lt: now } },
    select: { id: true, listingId: true },
    orderBy: { checkoutExpiresAt: "asc" },
    take: USER_PART_RECONCILIATION_LIMITS.expiredCheckouts,
  });
  let expiredReleased = 0;
  for (const order of expired) {
    const released = await prisma.$transaction(async (transaction) => {
      const cancelled = await transaction.userPartOrder.updateMany({
        where: { id: order.id, status: "CHECKOUT_PENDING", checkoutExpiresAt: { lt: now } },
        data: { status: "CANCELLED", cancelledAt: now },
      });
      if (cancelled.count !== 1) return false;
      await transaction.userPartListing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } });
      return true;
    });
    if (released) expiredReleased += 1;
  }

  const cutoffs = getUserPartReconciliationCutoffs(now);
  const reminderCandidates = await prisma.userPartOrder.findMany({
    where: {
      status: "PAID",
      paidAt: { lt: cutoffs.fulfillmentDueBefore },
      fulfillmentReminderSentAt: null,
      OR: [{ fulfillmentReminderLastAttemptAt: null }, { fulfillmentReminderLastAttemptAt: { lt: cutoffs.reminderRetryBefore } }],
    },
    select: { id: true, seller: { select: { name: true, email: true } }, listing: { select: { title: true } } },
    orderBy: { paidAt: "asc" },
    take: USER_PART_RECONCILIATION_LIMITS.reminders,
  });
  let remindersSent = 0;
  let remindersHeld = 0;
  for (const order of reminderCandidates) {
    const claimed = await prisma.userPartOrder.updateMany({
      where: { id: order.id, status: "PAID", fulfillmentReminderSentAt: null, OR: [{ fulfillmentReminderLastAttemptAt: null }, { fulfillmentReminderLastAttemptAt: { lt: cutoffs.reminderRetryBefore } }] },
      data: { fulfillmentReminderLastAttemptAt: now, fulfillmentReminderAttempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    const result = await sendUserPartOrderNotice({
      recipientEmail: order.seller.email,
      recipientName: order.seller.name || "Seller",
      subject: `Fulfillment reminder: ${order.listing.title}`,
      heading: "Your paid order needs attention",
      message: `The paid order for ${order.listing.title} is still awaiting fulfillment. Open the transaction to add tracking or confirm the handoff.`,
      orderId: order.id,
    });
    if (result.dispatched) {
      await prisma.userPartOrder.updateMany({ where: { id: order.id, status: "PAID", fulfillmentReminderSentAt: null }, data: { fulfillmentReminderSentAt: now } });
      remindersSent += 1;
    } else {
      remindersHeld += 1;
    }
  }

  return { expiredScanned: expired.length, expiredReleased, reminderCandidates: reminderCandidates.length, remindersSent, remindersHeld };
}
