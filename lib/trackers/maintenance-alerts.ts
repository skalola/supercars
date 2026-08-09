import { prisma } from "@/lib/prisma";
import { isValidEmail } from "@/lib/fulfillment/partner-registry";
import { getNextMaintenanceRecommendation } from "@/lib/maintenance/recommendations";
import { shouldSendMarketingAutomation } from "@/lib/admin/marketing-automation";

type ProviderSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type ProcessMaintenanceTrackerOptions = {
  dryRun?: boolean;
};

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "https://supercardash.vercel.app"
  ).replace(/\/$/, "");
}

function getFromAddress(): string {
  return (process.env.MAIL_FROM || "SUPERCAR DASH <no-reply@supercars.market>").replace(
    /^SUPERCARDASH\s*</i,
    "SUPERCAR DASH <",
  );
}

async function sendTrackerEmail(input: ProviderSendInput) {
  const provider = (process.env.MAIL_PROVIDER || "log").trim().toLowerCase();
  if (provider !== "resend") {
    console.log(`[Maintenance Tracker] ${input.subject} -> ${input.to}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is required when MAIL_PROVIDER=resend.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [input.to],
      reply_to: process.env.MAIL_REPLY_TO || process.env.SUPPORT_EMAIL || "support@supercars.market",
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${reason.slice(0, 500)}`);
  }
}

export async function processMaintenanceTrackerAlerts(options: ProcessMaintenanceTrackerOptions = {}) {
  const gate = await shouldSendMarketingAutomation("maintenance_alerts");
  if (!gate.enabled) return { scanned: 0, sent: 0, skipped: gate.skipped };

  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      trackerPreference: {
        maintenanceTrackerEnabled: true,
      },
    },
    include: {
      vehicles: {
        where: { status: "CLAIMED" },
        include: {
          profile: true,
          serviceRecords: true,
          model: {
            include: {
              make: true,
              maintenanceRules: true,
            },
          },
        },
      },
    },
  });

  let scanned = 0;
  let sent = 0;

  for (const user of users) {
    if (!isValidEmail(user.email)) continue;

    for (const vehicle of user.vehicles) {
      scanned++;
      const currentMileage =
        (vehicle as { currentMileage?: number | null }).currentMileage ??
        vehicle.mileage ??
        vehicle.profile?.currentMileage ??
        null;
      const recommendation = getNextMaintenanceRecommendation({
        currentMileage,
        rules: vehicle.model.maintenanceRules,
        serviceRecords: vehicle.serviceRecords,
      });

      if (!recommendation || recommendation.status === "UPCOMING") continue;

      const alertKey = `${vehicle.id}:${recommendation.alertKey}:${recommendation.status}`;
      const alreadySent = await prisma.trackerAlertDelivery.findUnique({
        where: {
          userId_alertType_alertKey: {
            userId: user.id,
            alertType: "MAINTENANCE",
            alertKey,
          },
        },
        select: { id: true },
      });

      if (alreadySent) continue;

      const email = buildMaintenanceEmail({
        recipientName: user.name || user.username || "there",
        vin: vehicle.vin,
        vehicleLabel: `${vehicle.year} ${vehicle.model.make.name} ${vehicle.model.name}`,
        recommendation,
      });

      if (!options.dryRun) {
        await sendTrackerEmail({
          to: user.email!,
          ...email,
        });

        await prisma.trackerAlertDelivery.create({
          data: {
            userId: user.id,
            vehicleId: vehicle.id,
            modelId: vehicle.modelId,
            alertType: "MAINTENANCE",
            alertKey,
          },
        });
      }

      sent++;
    }
  }

  return { scanned, sent };
}

function buildMaintenanceEmail({
  recipientName,
  vin,
  vehicleLabel,
  recommendation,
}: {
  recipientName: string;
  vin: string;
  vehicleLabel: string;
  recommendation: NonNullable<ReturnType<typeof getNextMaintenanceRecommendation>>;
}) {
  const passportUrl = `${getAppBaseUrl()}/vehicle/${vin}`;
  const statusText = recommendation.status === "DUE" ? "Due now" : "Due soon";
  const subject = `[SUPERCAR DASH] Maintenance Alert - ${vehicleLabel}`;
  const body = `${recommendation.serviceName} is ${statusText.toLowerCase()} for your ${vehicleLabel}. Vehicle Passport recommends service at ${recommendation.dueText}.`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Inter, system-ui, -apple-system, sans-serif; background:#f7f7f5; margin:0; padding:24px;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #dedfda; border-radius:12px; overflow:hidden;">
    <div style="padding:20px 24px; background:#111111; color:#ffffff; font-weight:900; letter-spacing:1.8px; text-align:center;">SUPERCAR DASH</div>
    <div style="padding:24px;">
      <div style="font-size:12px; color:#666a70; font-weight:800; text-transform:uppercase;">Maintenance tracker</div>
      <h1 style="margin:6px 0 12px; font-size:22px; line-height:1.2; color:#111111;">${escapeHtml(vehicleLabel)}</h1>
      <p style="margin:0 0 18px; color:#34373b; font-size:14px; line-height:1.55;">Hello ${escapeHtml(recipientName)}, ${escapeHtml(body)}</p>
      <div style="border:1px solid #ededeb; border-radius:8px; padding:14px; background:#fafafa;">
        <div style="display:flex; justify-content:space-between; gap:16px; padding:7px 0;"><span style="color:#666a70;">Service</span><strong>${escapeHtml(recommendation.serviceName)}</strong></div>
        <div style="display:flex; justify-content:space-between; gap:16px; padding:7px 0;"><span style="color:#666a70;">Status</span><strong>${escapeHtml(statusText)}</strong></div>
        <div style="display:flex; justify-content:space-between; gap:16px; padding:7px 0;"><span style="color:#666a70;">Recommended at</span><strong>${escapeHtml(recommendation.dueText)}</strong></div>
      </div>
      <div style="margin-top:22px; text-align:center;">
        <a href="${escapeHtml(passportUrl)}" style="display:inline-block; padding:12px 22px; background:#111111; color:#ffffff; text-decoration:none; border-radius:6px; font-size:14px; font-weight:800;">Open Vehicle Passport</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `SUPERCAR DASH

Maintenance tracker

Hello ${recipientName},

${body}

Service: ${recommendation.serviceName}
Status: ${statusText}
Recommended at: ${recommendation.dueText}

Open Vehicle Passport: ${passportUrl}
`;

  return { subject, html, text };
}

function escapeHtml(value: string | number | boolean | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
