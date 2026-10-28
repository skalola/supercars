import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { databaseIdSchema } from "@/lib/validation/common-inputs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedOrderId = databaseIdSchema.safeParse(url.searchParams.get("orderId"));
  const session = await auth();
  const buyerId = session?.user?.id;
  if (!parsedOrderId.success || !buyerId) return NextResponse.redirect(new URL("/garage", url));

  const order = await prisma.userPartOrder.findFirst({
    where: { id: parsedOrderId.data, buyerId },
    select: { id: true, listingId: true, status: true },
  });
  if (order?.status === "CHECKOUT_PENDING") {
    await prisma.$transaction([
      prisma.userPartOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } }),
      prisma.userPartListing.updateMany({ where: { id: order.listingId, status: "RESERVED" }, data: { status: "ACTIVE" } }),
    ]);
  }
  return NextResponse.redirect(new URL(`/parts/orders/${parsedOrderId.data}?payment=cancelled`, url));
}
