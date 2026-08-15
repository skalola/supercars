import { NextResponse } from "next/server";
import {
  processStripeWebhookPayload,
  verifyStripeWebhookSignature,
} from "@/lib/payments/payment-service";
import { reportServerError } from "@/lib/observability/error-reporting";

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeWebhookSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    const result = await processStripeWebhookPayload(payload);
    return NextResponse.json(result);
  } catch (error) {
    reportServerError(error, { route: "/api/payments/webhook", provider: "stripe" });
    const message = error instanceof Error ? error.message : "Payment webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
