import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canReuseCheckoutSession } from "@/lib/payments/payment-policy";
import { enforceActionRateLimit, isActionRateLimitError } from "@/lib/security/action-rate-limit";
import { checkoutRequestSchema } from "@/lib/validation/transaction-inputs";
import {
  createDealerPurchaseCheckoutSession,
  getDealerPurchaseCheckoutKey,
  getDealerPurchaseDepositCents,
} from "@/lib/payments/payment-service";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let rawPayload: unknown;
  try {
    rawPayload = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
  } catch {
    return NextResponse.json({ error: "Invalid checkout request body." }, { status: 400 });
  }
  const parsedInput = checkoutRequestSchema.safeParse(rawPayload);
  if (!parsedInput.success) {
    return NextResponse.json({ error: "Invalid dealer-purchase checkout request." }, { status: 400 });
  }
  const returnTo = parsedInput.data.returnTo || "/transactions";

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to pay the purchase request deposit.", loginUrl: `/login?returnTo=${encodeURIComponent(returnTo)}` },
      { status: 401 }
    );
  }

  const fulfillmentRequestId = parsedInput.data.fulfillmentRequestId;
  try {
    await enforceActionRateLimit({
      actorId: userId,
      action: "checkout_create",
      bucketKey: fulfillmentRequestId,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
  } catch (error) {
    if (isActionRateLimitError(error)) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const requestRecord = await prisma.fulfillmentRequest.findUnique({
    where: { id: fulfillmentRequestId },
    select: {
      id: true,
      buyerId: true,
      requestType: true,
      status: true,
      paymentStatus: true,
      listingId: true,
      publicTransactionToken: true,
      listing: {
        select: {
          askingPrice: true,
          price: true,
        },
      },
      vehicle: {
        select: {
          vin: true,
        },
      },
      fees: {
        select: {
          id: true,
          feeType: true,
        },
      },
      depositIntents: {
        select: {
          checkoutKey: true,
          checkoutUrl: true,
          checkoutExpiresAt: true,
          status: true,
        },
      },
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
  const checkoutKey = getDealerPurchaseCheckoutKey(requestRecord.id, depositCents);
  const reusableCheckout = requestRecord.depositIntents.find(
    (intent) =>
      intent.checkoutKey === checkoutKey &&
      canReuseCheckoutSession(intent)
  );
  if (reusableCheckout?.checkoutUrl) {
    return NextResponse.json({ url: reusableCheckout.checkoutUrl });
  }

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

    await tx.depositIntent.upsert({
      where: { checkoutKey: sessionResult.idempotencyKey },
      create: {
        fulfillmentRequestId: requestRecord.id,
        amount: depositDollars,
        currency: "USD",
        status: "HELD",
        paymentMethod: "STRIPE_CHECKOUT",
        transactionRef: `stripe_checkout:${sessionResult.id}`,
        checkoutKey: sessionResult.idempotencyKey,
        checkoutSessionId: sessionResult.id,
        checkoutUrl: sessionResult.url,
        checkoutExpiresAt: sessionResult.expiresAt,
      },
      update: {
        amount: depositDollars,
        currency: "USD",
        status: "HELD",
        paymentMethod: "STRIPE_CHECKOUT",
        transactionRef: `stripe_checkout:${sessionResult.id}`,
        checkoutSessionId: sessionResult.id,
        checkoutUrl: sessionResult.url,
        checkoutExpiresAt: sessionResult.expiresAt,
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
