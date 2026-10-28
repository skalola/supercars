"use server";

import { auth } from "@/auth";
import { createSellerOnboardingLink, retrieveSellerPaymentAccount } from "@/lib/payments/stripe-connect";
import { prisma } from "@/lib/prisma";
import { enforceActionRateLimit } from "@/lib/security/action-rate-limit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireSellerUser() {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user?.email) throw new Error("A verified account email is required before setting up seller payments.");
  return { id: user.id, email: user.email };
}

export async function startSellerOnboardingAction() {
  const user = await requireSellerUser();
  await enforceActionRateLimit({
    actorId: user.id,
    action: "seller_onboarding",
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  const link = await createSellerOnboardingLink({ userId: user.id, email: user.email });
  redirect(link.url);
}

export async function refreshSellerPaymentStatusAction() {
  const user = await requireSellerUser();
  await enforceActionRateLimit({
    actorId: user.id,
    action: "seller_status_refresh",
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  await retrieveSellerPaymentAccount(user.id);
  revalidatePath("/profile/edit");
  redirect("/profile/edit?seller=updated");
}
