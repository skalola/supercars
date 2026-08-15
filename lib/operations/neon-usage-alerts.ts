import { prisma } from "@/lib/prisma";
import { sendBasicEmail } from "@/lib/mail/mail-service";

const THRESHOLDS = [50, 70, 85] as const;
type UsageMetric = "network" | "storage";

export async function checkNeonUsageThresholds() {
  const apiKey = process.env.NEON_API_KEY;
  const orgId = process.env.NEON_ORG_ID;
  const projectId = process.env.NEON_PROJECT_ID;
  const recipientEmail = process.env.OPERATIONS_ALERT_EMAIL || process.env.MAIL_REPLY_TO;
  const networkLimit = positiveNumber(process.env.NEON_NETWORK_TRANSFER_LIMIT_BYTES);
  const storageLimit = positiveNumber(process.env.NEON_STORAGE_LIMIT_BYTES_MONTH);

  if (!apiKey || !orgId || !projectId || !recipientEmail || !networkLimit || !storageLimit) {
    return {
      configured: false,
      message: "Neon usage alerts require API, project, organization, recipient, and quota environment values.",
    };
  }

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const url = new URL("https://console.neon.tech/api/v2/consumption_history/v2/projects");
  url.searchParams.set("from", from.toISOString());
  url.searchParams.set("to", now.toISOString());
  url.searchParams.set("granularity", "daily");
  url.searchParams.set("org_id", orgId);
  url.searchParams.set("project_ids", projectId);
  url.searchParams.set("metrics", "public_network_transfer_bytes,root_branch_bytes_month");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Neon consumption API failed with ${response.status}.`);
  }

  const payload: unknown = await response.json();
  const networkUsed = sumMetric(payload, "public_network_transfer_bytes");
  const storageUsed = sumMetric(payload, "root_branch_bytes_month");
  const results = await Promise.all([
    updateMetricAlerts("network", networkUsed, networkLimit, recipientEmail),
    updateMetricAlerts("storage", storageUsed, storageLimit, recipientEmail),
  ]);

  return {
    configured: true,
    network: { used: networkUsed, limit: networkLimit, percent: percentage(networkUsed, networkLimit) },
    storage: { used: storageUsed, limit: storageLimit, percent: percentage(storageUsed, storageLimit) },
    alerts: results.flatMap((result) => result.alerts),
  };
}

async function updateMetricAlerts(
  metric: UsageMetric,
  used: number,
  limit: number,
  recipientEmail: string
) {
  const percent = percentage(used, limit);
  const keys = THRESHOLDS.map((threshold) => settingKey(metric, threshold));
  const existing = await prisma.globalSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, enabled: true },
  });
  const existingByKey = new Map(existing.map((row) => [row.key, row.enabled]));

  const crossed = THRESHOLDS.filter(
    (threshold) => percent >= threshold && !existingByKey.get(settingKey(metric, threshold))
  );
  const reset = THRESHOLDS.filter(
    (threshold) => percent < threshold && existingByKey.get(settingKey(metric, threshold))
  );

  if (crossed.length > 0 || reset.length > 0 || existing.length !== THRESHOLDS.length) {
    await prisma.$transaction(
      THRESHOLDS.map((threshold) =>
        prisma.globalSetting.upsert({
          where: { key: settingKey(metric, threshold) },
          create: {
            key: settingKey(metric, threshold),
            label: `Neon ${metric} ${threshold}% alert`,
            description: "Tracks delivery of monthly Neon quota alerts.",
            category: "OPERATIONS",
            enabled: percent >= threshold,
            updatedBy: "SYSTEM",
          },
          update: { enabled: percent >= threshold, updatedBy: "SYSTEM" },
        })
      )
    );
  }

  const highestCrossing = crossed.at(-1);
  if (!highestCrossing) return { alerts: [] as string[] };

  const subject = `SUPERCAR DASH Neon ${metric} usage reached ${percent.toFixed(1)}%`;
  const message = `${metric === "network" ? "Network transfer" : "Storage"} usage crossed the ${highestCrossing}% threshold. ` +
    `Current usage is ${formatBytes(used)} of ${formatBytes(limit)} for the monitored monthly allowance.`;
  const delivery = await sendBasicEmail({
    recipientEmail,
    recipientName: "SUPERCAR DASH Operations",
    subject,
    html: `<p>${message}</p><p>Review Neon usage before the next threshold is reached.</p>`,
    text: `${message}\n\nReview Neon usage before the next threshold is reached.`,
  });

  return { alerts: [delivery.dispatched ? subject : `${subject} (email not dispatched)`] };
}

function settingKey(metric: UsageMetric, threshold: number) {
  return `neon_${metric}_${threshold}_alerted`;
}

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function percentage(used: number, limit: number) {
  return limit > 0 ? (used / limit) * 100 : 0;
}

function sumMetric(value: unknown, metric: string): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + sumMetric(item, metric), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce((sum, [key, nested]) => {
    if (key === metric && typeof nested === "number") return sum + nested;
    return sum + sumMetric(nested, metric);
  }, 0);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(2)} ${units[unit]}`;
}
