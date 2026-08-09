import { NextRequest, NextResponse } from "next/server";
import { processMeetLifecycle } from "@/lib/meets/meet-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const isVercelCron =
    request.headers.get("x-vercel-cron") === "1" ||
    /vercel-cron/i.test(userAgent);

  if (secret && authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  if (!secret && process.env.VERCEL === "1" && !isVercelCron) {
    return NextResponse.json({ error: "Cron route is only available to Vercel cron." }, { status: 401 });
  }

  const startedAt = new Date();
  const result = await processMeetLifecycle();

  return NextResponse.json({
    success: true,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    reminderCount: result.reminderCount,
    completedCount: result.completedCount,
    reminderWindowEnd: result.reminderWindowEnd.toISOString(),
  });
}
