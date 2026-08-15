import { NextRequest, NextResponse } from "next/server";
import { checkNeonUsageThresholds } from "@/lib/operations/neon-usage-alerts";
import { reportServerError } from "@/lib/observability/error-reporting";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    return NextResponse.json(await checkNeonUsageThresholds());
  } catch (error) {
    reportServerError(error, { route: "/api/cron/neon-usage-alerts" });
    return NextResponse.json({ error: "Neon usage check failed." }, { status: 500 });
  }
}
