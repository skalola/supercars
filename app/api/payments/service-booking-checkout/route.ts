import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canReuseCheckoutSession } from "@/lib/payments/payment-policy";
import { enforceActionRateLimit, isActionRateLimitError } from "@/lib/security/action-rate-limit";
import { checkoutRequestSchema } from "@/lib/validation/transaction-inputs";
import {
  createServiceBookingCheckoutSession,
  getServiceBookingCheckoutKey,
  getServiceBookingFeeCents,
} from "@/lib/payments/payment-service";

export async function POST(request: NextRequest) {
  try {
    return await handleServiceBookingCheckout(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe Checkout failure";
    console.error("[service-booking-checkout] Unable to create Checkout session", {
      message,
    });
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production"
          ? "Stripe Checkout could not be started. Please try again or contact support."
          : message,
      },
      { status: 502 },
    );
  }
}

async function handleServiceBookingCheckout(request: NextRequest) {
  const wantsJson = request.headers.get("content-type")?.includes("application/json") || false;
  let rawPayload: Record<string, unknown>;
  try {
    rawPayload = wantsJson
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
  } catch {
    return NextResponse.json({ error: "Invalid service-booking checkout request." }, { status: 400 });
  }
  const parsedInput = checkoutRequestSchema.safeParse({
    fulfillmentRequestId: rawPayload.fulfillmentRequestId,
    returnTo: rawPayload.returnTo || undefined,
  });
  if (!parsedInput.success) {
    return NextResponse.json({ error: "Invalid service-booking checkout request." }, { status: 400 });
  }
  const returnTo = parsedInput.data.returnTo || "/transactions";

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    if (wantsJson) {
      return NextResponse.json(
        { error: "Please sign in to pay the service-booking fee.", loginUrl: `/login?returnTo=${encodeURIComponent(returnTo)}` },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, request.url), { status: 303 });
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

  const booking = await prisma.fulfillmentRequest.findUnique({
    where: { id: fulfillmentRequestId },
    select: {
      id: true,
      buyerId: true,
      requestType: true,
      status: true,
      paymentStatus: true,
      vehicleId: true,
      publicTransactionToken: true,
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
      partnerTokens: {
        select: { partnerEmail: true },
        take: 1,
      },
    },
  });

  if (!booking || booking.requestType !== "SERVICE_BOOKING") {
    return NextResponse.json({ error: "Service booking not found." }, { status: 404 });
  }

  if (booking.buyerId !== userId) {
    return NextResponse.json({ error: "You do not own this service booking." }, { status: 403 });
  }

  if (!booking.vehicleId || !booking.vehicle?.vin) {
    return NextResponse.json({ error: "Service booking is missing VIN-backed vehicle context." }, { status: 400 });
  }

  if (!booking.partnerTokens[0]?.partnerEmail) {
    return NextResponse.json({ error: "The selected service shop does not have a verified booking email." }, { status: 409 });
  }

  if (booking.paymentStatus === "PAID" || booking.status === "CONFIRMED") {
    return NextResponse.json({ error: "Service booking has already been paid." }, { status: 409 });
  }

  if (!["READY_TO_SEND", "DRAFT", "ACCEPTED_AWAITING_PAYMENT", "PAYMENT_PROCESSING"].includes(booking.status)) {
    return NextResponse.json({ error: `Service booking cannot be paid while ${booking.status}.` }, { status: 409 });
  }

  const feeCents = getServiceBookingFeeCents();
  const feeDollars = feeCents / 100;
  const checkoutKey = getServiceBookingCheckoutKey(booking.id, feeCents);
  const reusableCheckout = booking.depositIntents.find(
    (intent) =>
      intent.checkoutKey === checkoutKey &&
      canReuseCheckoutSession(intent)
  );
  if (reusableCheckout?.checkoutUrl) {
    if (wantsJson) return NextResponse.json({ url: reusableCheckout.checkoutUrl });
    return NextResponse.redirect(reusableCheckout.checkoutUrl, { status: 303 });
  }

  const sessionResult = await createServiceBookingCheckoutSession({
    fulfillmentRequestId: booking.id,
    vehicleId: booking.vehicleId,
    vin: booking.vehicle.vin,
    ownerUserId: userId,
    publicTransactionToken: booking.publicTransactionToken,
    amountCents: feeCents,
    currency: "USD",
  });

  await prisma.$transaction(async (tx) => {
    const serviceFee = booking.fees.find((fee) => fee.feeType === "SERVICE_FEE");
    if (serviceFee) {
      await tx.fulfillmentFee.update({
        where: { id: serviceFee.id },
        data: {
          amount: feeDollars,
          currency: "USD",
          status: "AUTHORIZED",
          description: "SUPERCAR DASH service-booking platform fee",
        },
      });
    } else {
      await tx.fulfillmentFee.create({
        data: {
          fulfillmentRequestId: booking.id,
          feeType: "SERVICE_FEE",
          amount: feeDollars,
          currency: "USD",
          status: "AUTHORIZED",
          description: "SUPERCAR DASH service-booking platform fee",
        },
      });
    }

    await tx.depositIntent.upsert({
      where: { checkoutKey: sessionResult.idempotencyKey },
      create: {
        fulfillmentRequestId: booking.id,
        amount: feeDollars,
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
        amount: feeDollars,
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
      where: { id: booking.id },
      data: {
        status: "PAYMENT_PROCESSING",
        paymentStatus: "PROCESSING",
      },
    });

    await tx.fulfillmentEvent.create({
      data: {
        fulfillmentRequestId: booking.id,
        previousStatus: booking.status,
        newStatus: "PAYMENT_PROCESSING",
        actorType: "BUYER",
        actorId: userId,
        note: "Stripe Checkout Session created for service-booking platform fee",
        metadata: JSON.stringify({
          stripeCheckoutSessionId: sessionResult.id,
          amountCents: feeCents,
          currency: sessionResult.currency,
        }),
      },
    });
  });

  if (wantsJson) return NextResponse.json({ url: sessionResult.url });
  return NextResponse.redirect(sessionResult.url, { status: 303 });
}
