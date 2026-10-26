import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { VEHICLE_MARKETPLACE_ENABLED } from "@/lib/marketplace/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  if (!VEHICLE_MARKETPLACE_ENABLED) {
    return NextResponse.json(
      { success: false, disabled: true, message: "Vehicle marketplace acquisition is paused." },
      { status: 410 },
    );
  }

  return NextResponse.json({ error: "Inventory refresh is not available through this route." }, { status: 501 });
}
