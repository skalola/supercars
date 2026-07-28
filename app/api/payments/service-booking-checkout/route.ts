import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createServiceBookingCheckoutSession,
  getServiceBookingFeeCents,
} from "@/lib/payments/payment-service";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") || "/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, request.url), { status: 303 });
  }

  const fulfillmentRequestId = String(formData.get("fulfillmentRequestId") || "");
  if (!fulfillmentRequestId) {
    return NextResponse.json({ error: "Missing service booking id." }, { status: 400 });
  }

  const booking = await prisma.fulfillmentRequest.findUnique({
    where: { id: fulfillmentRequestId },
    include: {
      vehicle: true,
      fees: true,
      depositIntents: true,
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

  if (booking.paymentStatus === "PAID" || booking.status === "CONFIRMED") {
    return NextResponse.json({ error: "Service booking has already been paid." }, { status: 409 });
  }

  if (
    booking.status !== "ACCEPTED_AWAITING_PAYMENT" &&
    !(booking.status === "PAYMENT_PROCESSING" && booking.paymentStatus === "FAILED")
  ) {
    return NextResponse.json({ error: `Service booking cannot be paid while ${booking.status}.` }, { status: 409 });
  }

  const feeCents = getServiceBookingFeeCents();
  const feeDollars = feeCents / 100;
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

    await tx.depositIntent.create({
      data: {
        fulfillmentRequestId: booking.id,
        amount: feeDollars,
        currency: "USD",
        status: "HELD",
        paymentMethod: "STRIPE_CHECKOUT",
        transactionRef: `stripe_checkout:${sessionResult.id}`,
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

  return NextResponse.redirect(sessionResult.url, { status: 303 });
}
