import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const output = await runWeeklyRefresh();

  return NextResponse.json({
    success: true,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    output,
  });
}

async function runWeeklyRefresh() {
  const logs: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["run", "refresh-inventory-weekly"], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
    });

    child.stdout.on("data", (chunk) => {
      logs.push(String(chunk));
    });

    child.stderr.on("data", (chunk) => {
      logs.push(String(chunk));
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Weekly inventory refresh failed with exit code ${code}.`));
    });
  });

  return logs.join("").slice(-20_000);
}
