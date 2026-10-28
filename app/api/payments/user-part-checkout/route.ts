import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createUserPartCheckoutSession } from "@/lib/payments/user-part-payments";
import { getUserPartCheckoutKey, getUserPartPlatformFeeCents, isReusableUserPartCheckout } from "@/lib/payments/user-part-payment-policy";
import { isSellerPaymentReady } from "@/lib/payments/stripe-connect-policy";
import { prisma } from "@/lib/prisma";
import { enforceActionRateLimit, isActionRateLimitError } from "@/lib/security/action-rate-limit";
import { databaseIdSchema } from "@/lib/validation/common-inputs";

const inputSchema = z.object({ listingId: databaseIdSchema }).strict();

export async function POST(request: Request) {
  try {
    const session = await auth();
    const buyerId = session?.user?.id;
    if (!buyerId) return NextResponse.json({ error: "Sign in to purchase this part." }, { status: 401 });

    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "Invalid part checkout request." }, { status: 400 });
    await enforceActionRateLimit({
      actorId: buyerId,
      action: "user_part_checkout",
      bucketKey: input.data.listingId,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    const listing = await prisma.userPartListing.findUnique({
      where: { id: input.data.listingId },
      select: {
        id: true,
        sellerId: true,
        title: true,
        status: true,
        priceCents: true,
        quantity: true,
        shippingMode: true,
        shippingCostCents: true,
        seller: {
          select: {
            sellerPaymentAccount: {
              select: { providerAccountId: true, onboardingStatus: true, chargesEnabled: true, payoutsEnabled: true },
            },
          },
        },
      },
    });
    if (!listing) return NextResponse.json({ error: "Part listing not found." }, { status: 404 });
    if (listing.sellerId === buyerId) return NextResponse.json({ error: "You cannot purchase your own listing." }, { status: 409 });

    const existing = await prisma.userPartOrder.findFirst({
      where: { listingId: listing.id, buyerId, status: "CHECKOUT_PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (existing && isReusableUserPartCheckout(existing) && existing.checkoutUrl) {
      return NextResponse.json({ url: existing.checkoutUrl, orderId: existing.id });
    }

    const paymentAccount = listing.seller.sellerPaymentAccount;
    if (!paymentAccount || !isSellerPaymentReady(paymentAccount)) {
      return NextResponse.json({ error: "This seller is not ready to receive payments." }, { status: 409 });
    }
    if (listing.status !== "ACTIVE" || listing.quantity < 1) {
      return NextResponse.json({ error: "This part is no longer available." }, { status: 409 });
    }

    const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { email: true, name: true } });
    const shippingAmountCents = listing.shippingMode === "LOCAL_PICKUP" ? 0 : listing.shippingCostCents || 0;
    const platformFeeCents = getUserPartPlatformFeeCents(listing.priceCents);
    const totalAmountCents = listing.priceCents + shippingAmountCents;
    const order = await prisma.$transaction(async (transaction) => {
      const reserved = await transaction.userPartListing.updateMany({
        where: { id: listing.id, status: "ACTIVE", quantity: { gte: 1 } },
        data: { status: "RESERVED" },
      });
      if (reserved.count !== 1) throw new Error("This part was just reserved by another buyer.");
      const id = crypto.randomUUID();
      return transaction.userPartOrder.create({
        data: {
          id,
          listingId: listing.id,
          buyerId,
          sellerId: listing.sellerId,
          itemAmountCents: listing.priceCents,
          shippingAmountCents,
          platformFeeCents,
          totalAmountCents,
          connectedAccountId: paymentAccount.providerAccountId,
          buyerEmail: buyer?.email || null,
          buyerName: buyer?.name || null,
          checkoutKey: getUserPartCheckoutKey(id, totalAmountCents),
        },
      });
    });

    try {
      const checkout = await createUserPartCheckoutSession({
        orderId: order.id,
        listingTitle: listing.title,
        connectedAccountId: paymentAccount.providerAccountId,
        itemAmountCents: listing.priceCents,
        shippingAmountCents,
        platformFeeCents,
        totalAmountCents,
        buyerId,
        buyerEmail: buyer?.email || null,
        sellerId: listing.sellerId,
        listingId: listing.id,
        collectShippingAddress: listing.shippingMode !== "LOCAL_PICKUP",
      });
      await prisma.userPartOrder.update({
        where: { id: order.id },
        data: {
          checkoutSessionId: checkout.id,
          checkoutUrl: checkout.url,
          checkoutExpiresAt: checkout.expiresAt,
        },
      });
      return NextResponse.json({ url: checkout.url, orderId: order.id });
    } catch (error) {
      await prisma.$transaction([
        prisma.userPartOrder.update({ where: { id: order.id }, data: { status: "FAILED", cancelledAt: new Date() } }),
        prisma.userPartListing.updateMany({ where: { id: listing.id, status: "RESERVED" }, data: { status: "ACTIVE" } }),
      ]);
      throw error;
    }
  } catch (error) {
    const status = isActionRateLimitError(error) ? 429 : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe Checkout could not be started." },
      { status },
    );
  }
}
