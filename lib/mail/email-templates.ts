/**
 * lib/mail/email-templates.ts
 *
 * Sprint 7.8 Standardized Email Templates.
 * Provides HTML & Plain Text formatters for 10 core fulfillment email notifications.
 */

export type EmailTemplateType =
  | "DEALER_PURCHASE_REQUEST"
  | "INSURANCE_QUOTE_REQUEST"
  | "TRANSPORT_REQUEST"
  | "SERVICE_BOOKING_REQUEST"
  | "BUYER_CONFIRMATION"
  | "SELLER_CONFIRMATION"
  | "ACCEPTED_NOTIFICATION"
  | "DECLINED_NOTIFICATION"
  | "EXPIRED_NOTIFICATION"
  | "CANCELLATION_REFUND_NOTIFICATION";

export interface EmailTemplateParams {
  templateType: EmailTemplateType;
  recipientName: string;
  recipientEmail: string;
  packageTitle: string;
  vehicleSummary: string; // e.g. "2021 Lamborghini Huracan (VIN: ZHW...)"
  priceOrAmount?: number | string;
  reviewUrl: string; // Tokenized link or transaction URL
  expirationDate?: string;
  acceptUrl?: string;
  declineUrl?: string;
  additionalDetails?: Record<string, string | number | boolean | null | undefined>;
}

function escapeHtml(value: string | number | boolean | null | undefined): string {
  return String(value ?? "N/A")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(value: number | string): string {
  if (typeof value === "number") return `$${value.toLocaleString()}`;
  return value.trim().startsWith("$") ? value : `$${value}`;
}

function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "https://supercars.market"
  ).replace(/\/$/, "");
}

export function generateEmailTemplate(params: EmailTemplateParams): { subject: string; html: string; text: string } {
  const baseUrl = getAppBaseUrl();
  const fullReviewUrl = params.reviewUrl.startsWith("http") ? params.reviewUrl : `${baseUrl}${params.reviewUrl}`;
  const fullAcceptUrl = params.acceptUrl ? (params.acceptUrl.startsWith("http") ? params.acceptUrl : `${baseUrl}${params.acceptUrl}`) : `${fullReviewUrl}/accept`;
  const fullDeclineUrl = params.declineUrl ? (params.declineUrl.startsWith("http") ? params.declineUrl : `${baseUrl}${params.declineUrl}`) : `${fullReviewUrl}/decline`;
  const expirationText = params.expirationDate || "7 Days from issue date";
  const amountText = params.priceOrAmount !== undefined ? formatAmount(params.priceOrAmount) : null;

  let subject = "";
  let actionTitle = "";

  switch (params.templateType) {
    case "DEALER_PURCHASE_REQUEST":
      subject = `[SUPERCARS Offer] Purchase Request — ${params.vehicleSummary}`;
      actionTitle = "New Buyer Purchase Offer";
      break;
    case "INSURANCE_QUOTE_REQUEST":
      subject = `[SUPERCARS Quote Request] Agreed Value Policy — ${params.vehicleSummary}`;
      actionTitle = "Agreed Value Insurance Quote Request";
      break;
    case "TRANSPORT_REQUEST":
      subject = `[SUPERCARS Transport] Enclosed Carrier Haul — ${params.vehicleSummary}`;
      actionTitle = "Enclosed Vehicle Transport Request";
      break;
    case "SERVICE_BOOKING_REQUEST":
      subject = `[SUPERCARS Service] Appointment Booking — ${params.vehicleSummary}`;
      actionTitle = "Certified Service Appointment Request";
      break;
    case "BUYER_CONFIRMATION":
      subject = `[SUPERCARS] Fulfillment Request Submitted — ${params.vehicleSummary}`;
      actionTitle = "Fulfillment Request Confirmation";
      break;
    case "SELLER_CONFIRMATION":
      subject = `[SUPERCARS] Buyer Purchase Offer Submitted — ${params.vehicleSummary}`;
      actionTitle = "Buyer Purchase Offer Summary";
      break;
    case "ACCEPTED_NOTIFICATION":
      subject = `[SUPERCARS Confirmed] Request Accepted — ${params.vehicleSummary}`;
      actionTitle = "Partner Decision Confirmed";
      break;
    case "DECLINED_NOTIFICATION":
      subject = `[SUPERCARS Notice] Request Declined — ${params.vehicleSummary}`;
      actionTitle = "Partner Decision Declined";
      break;
    case "EXPIRED_NOTIFICATION":
      subject = `[SUPERCARS Notice] Request Decision Link Expired — ${params.vehicleSummary}`;
      actionTitle = "Request Expired";
      break;
    case "CANCELLATION_REFUND_NOTIFICATION":
      subject = `[SUPERCARS Notice] Request Cancelled & Refunded — ${params.vehicleSummary}`;
      actionTitle = "Order Cancellation & Settlement";
      break;
  }

  // HTML Details list generator
  const detailsHtml = params.additionalDetails
    ? Object.entries(params.additionalDetails)
        .map(
          ([k, v]) => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase;">${escapeHtml(k)}:</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 600; text-align: right;">${escapeHtml(v)}</td>
          </tr>`
        )
        .join("")
    : "";

  const isPartnerRequest = [
    "DEALER_PURCHASE_REQUEST",
    "INSURANCE_QUOTE_REQUEST",
    "TRANSPORT_REQUEST",
    "SERVICE_BOOKING_REQUEST",
  ].includes(params.templateType);

  const ctaButtonsHtml = isPartnerRequest
    ? `
    <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
      <a href="${escapeHtml(fullAcceptUrl)}" style="background-color: #10b981; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">ACCEPT REQUEST</a>
      <a href="${escapeHtml(fullDeclineUrl)}" style="background-color: #ef4444; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">DECLINE REQUEST</a>
    </div>`
    : `
    <div style="margin-top: 24px; text-align: center;">
      <a href="${escapeHtml(fullReviewUrl)}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">VIEW TRANSACTION HUB</a>
    </div>`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: Inter, system-ui, -apple-system, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);">
    
    <!-- SUPERCARS Header -->
    <div style="background-color: #0f172a; padding: 20px 24px; text-align: center; border-bottom: 3px solid #ef4444;">
      <span style="color: #ffffff; font-size: 20px; font-weight: 900; letter-spacing: 2px;">SUPERCARS MARKETPLACE</span>
    </div>

    <!-- Main Content Body -->
    <div style="padding: 24px;">
      <div style="font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">
        ${actionTitle}
      </div>
      <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px;">
        ${escapeHtml(params.packageTitle)}
      </h2>

      <p style="font-size: 14px; color: #334155; line-height: 1.5;">
        Hello <strong>${escapeHtml(params.recipientName)}</strong>,
      </p>
      
      <!-- Summary Box -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600;">VEHICLE:</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 700; text-align: right;">${escapeHtml(params.vehicleSummary)}</td>
          </tr>
          ${amountText ? `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600;">AMOUNT / PRICE:</td>
            <td style="padding: 8px 0; color: #10b981; font-size: 15px; font-weight: 800; text-align: right;">${escapeHtml(amountText)}</td>
          </tr>` : ""}
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600;">EXPIRATION:</td>
            <td style="padding: 8px 0; color: #ef4444; font-size: 13px; font-weight: 700; text-align: right;">${escapeHtml(expirationText)}</td>
          </tr>
          ${detailsHtml}
        </table>
      </div>

      <!-- Action Buttons -->
      ${ctaButtonsHtml}

      <div style="margin-top: 20px; font-size: 12px; color: #64748b; text-align: center;">
        Direct Review Link: <a href="${escapeHtml(fullReviewUrl)}" style="color: #2563eb;">${escapeHtml(fullReviewUrl)}</a>
      </div>
    </div>

    <!-- SUPERCARS Footer -->
    <div style="background-color: #f1f5f9; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; line-height: 1.4;">
      <div>SUPERCARS Marketplace &middot; Enterprise Vehicle Fulfillment & Passport Platform</div>
      <div>Questions or assistance? Contact support at <a href="mailto:support@supercars.market" style="color: #2563eb;">support@supercars.market</a></div>
      <div style="margin-top: 8px; color: #94a3b8;">This email is confidential and intended solely for ${escapeHtml(params.recipientEmail)}.</div>
    </div>

  </div>
</body>
</html>`;

  const text = `
==================================================
SUPERCARS MARKETPLACE — ${actionTitle.toUpperCase()}
==================================================

Hello ${params.recipientName},

${params.packageTitle}

VEHICLE: ${params.vehicleSummary}
${amountText ? `AMOUNT / PRICE: ${amountText}\n` : ""}EXPIRATION: ${expirationText}

Secure Review Link: ${fullReviewUrl}
${params.acceptUrl ? `Accept Link: ${fullAcceptUrl}\n` : ""}${params.declineUrl ? `Decline Link: ${fullDeclineUrl}\n` : ""}
--------------------------------------------------
SUPERCARS Marketplace — support@supercars.market
Confidential notification for ${params.recipientEmail}
`;

  return { subject, html, text };
}
