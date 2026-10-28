import { auth } from "@/auth";
import { createSellerOnboardingLink } from "@/lib/payments/stripe-connect";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) return NextResponse.redirect(new URL("/profile/edit?seller=email-required", request.url));

  try {
    const link = await createSellerOnboardingLink({ userId, email: user.email });
    return NextResponse.redirect(link.url);
  } catch {
    return NextResponse.redirect(new URL("/profile/edit?seller=setup-error", request.url));
  }
}
