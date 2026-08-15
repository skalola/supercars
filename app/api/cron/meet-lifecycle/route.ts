import { NextRequest, NextResponse } from "next/server";
import { processMeetLifecycle } from "@/lib/meets/meet-lifecycle";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { pruneExpiredActionRateLimits } from "@/lib/security/action-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const startedAt = new Date();
  const [result, prunedRateLimits] = await Promise.all([
    processMeetLifecycle(),
    pruneExpiredActionRateLimits(),
  ]);

  return NextResponse.json({
    success: true,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    reminderCount: result.reminderCount,
    completedCount: result.completedCount,
    reminderWindowEnd: result.reminderWindowEnd.toISOString(),
    prunedRateLimits,
  });
}
