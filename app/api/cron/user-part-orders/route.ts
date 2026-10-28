import { NextRequest, NextResponse } from "next/server";
import { reconcileUserPartOrders } from "@/lib/parts/user-part-order-reconciliation";
import { reportServerError } from "@/lib/observability/error-reporting";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  try {
    return NextResponse.json({ success: true, ...(await reconcileUserPartOrders()), finishedAt: new Date().toISOString() });
  } catch (error) {
    reportServerError(error, { route: "/api/cron/user-part-orders" });
    return NextResponse.json({ error: "User part order reconciliation failed." }, { status: 500 });
  }
}
