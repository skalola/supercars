import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createDealerPurchaseCheckoutSession,
  getDealerPurchaseDepositCents,
} from "@/lib/payments/payment-service";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries((await request.formData()).entries());
  const returnTo = String(payload.returnTo || "/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to pay the purchase request deposit.", loginUrl: `/login?returnTo=${encodeURIComponent(returnTo)}` },
      { status: 401 }
    );
  }

  const fulfillmentRequestId = String(payload.fulfillmentRequestId || "");
  if (!fulfillmentRequestId) {
    return NextResponse.json({ error: "Missing dealer purchase request id." }, { status: 400 });
  }

  const requestRecord = await prisma.fulfillmentRequest.findUnique({
    where: { id: fulfillmentRequestId },
    include: {
      listing: true,
      vehicle: true,
      fees: true,
      depositIntents: true,
    },
  });

  if (!requestRecord || requestRecord.requestType !== "DEALER_PURCHASE") {
    return NextResponse.json({ error: "Dealer purchase request not found." }, { status: 404 });
  }

  if (requestRecord.buyerId !== userId) {
    return NextResponse.json({ error: "You do not own this purchase request." }, { status: 403 });
  }

  if (!requestRecord.listingId || !requestRecord.vehicle?.vin) {
    return NextResponse.json({ error: "Purchase request is missing VIN-backed listing context." }, { status: 400 });
  }

  if (requestRecord.paymentStatus === "AUTHORIZED" || requestRecord.paymentStatus === "PAID") {
    return NextResponse.json({ error: "Purchase request deposit is already pending dealer acceptance." }, { status: 409 });
  }

  const listingAmount = requestRecord.listing?.askingPrice ?? requestRecord.listing?.price ?? 0;
  const depositCents = getDealerPurchaseDepositCents(listingAmount);
  if (!depositCents) {
    return NextResponse.json({ error: "Purchase request is missing a valid listing price." }, { status: 400 });
  }
  const depositDollars = depositCents / 100;
  const sessionResult = await createDealerPurchaseCheckoutSession({
    fulfillmentRequestId: requestRecord.id,
    listingId: requestRecord.listingId,
    vin: requestRecord.vehicle.vin,
    buyerUserId: userId,
    publicTransactionToken: requestRecord.publicTransactionToken,
    amountCents: depositCents,
    currency: "USD",
  });

  await prisma.$transaction(async (tx) => {
    const depositFee = requestRecord.fees.find((fee) => fee.feeType === "DEPOSIT");
    if (depositFee) {
      await tx.fulfillmentFee.update({
        where: { id: depositFee.id },
        data: {
          amount: depositDollars,
          currency: "USD",
          status: "AUTHORIZED",
          description: "SUPERCAR DASH purchase request deposit paid through Stripe Checkout",
        },
      });
    } else {
      await tx.fulfillmentFee.create({
        data: {
          fulfillmentRequestId: requestRecord.id,
          feeType: "DEPOSIT",
          amount: depositDollars,
          currency: "USD",
          status: "AUTHORIZED",
          description: "SUPERCAR DASH purchase request deposit paid through Stripe Checkout",
        },
      });
    }

    await tx.depositIntent.create({
      data: {
        fulfillmentRequestId: requestRecord.id,
        amount: depositDollars,
        currency: "USD",
        status: "HELD",
        paymentMethod: "STRIPE_CHECKOUT",
        transactionRef: `stripe_checkout:${sessionResult.id}`,
      },
    });

    await tx.fulfillmentRequest.update({
      where: { id: requestRecord.id },
      data: {
        paymentStatus: "PROCESSING",
      },
    });

    await tx.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: requestRecord.id,
        previousStatus: requestRecord.status,
        newStatus: requestRecord.status,
        actorType: "BUYER",
        actorId: userId,
        note: "Stripe Checkout Session created for dealer-purchase deposit",
        metadata: JSON.stringify({
          stripeCheckoutSessionId: sessionResult.id,
          amountCents: depositCents,
          listingAmount,
          currency: sessionResult.currency,
          captureMethod: "manual",
        }),
      },
    });
  });

  return NextResponse.json({ url: sessionResult.url });
}
