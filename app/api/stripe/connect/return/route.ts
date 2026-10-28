import { auth } from "@/auth";
import { retrieveSellerPaymentAccount } from "@/lib/payments/stripe-connect";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  try {
    await retrieveSellerPaymentAccount(userId);
    return NextResponse.redirect(new URL("/profile/edit?seller=updated", request.url));
  } catch {
    return NextResponse.redirect(new URL("/profile/edit?seller=sync-error", request.url));
  }
}
