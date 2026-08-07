import { generateEmailTemplate } from "@/lib/mail/email-templates";

export type MarketingEmailPreview = {
  key: string;
  eyebrow: string;
  from: string;
  subject: string;
  audience: string;
  trigger: string;
  sampleData: string[];
  html: string;
  text: string;
};

const appUrl = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  process.env.NEXTAUTH_URL ||
  "https://supercardash.vercel.app"
).replace(/\/$/, "");
const mailFrom = process.env.MAIL_FROM || "SUPERCAR DASH <onboarding@resend.dev>";

function escapeHtml(value: string | number | boolean | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTrackerEmailPreview({
  key,
  eyebrow,
  subject,
  headline,
  body,
  ctaLabel,
  ctaUrl,
  rows,
  audience,
  trigger,
}: {
  key: string;
  eyebrow: string;
  subject: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  rows: Array<[string, string]>;
  audience: string;
  trigger: string;
}): MarketingEmailPreview {
  const detailsHtml = rows
    .map(
      ([label, value]) => `
        <div style="display:flex; justify-content:space-between; gap:16px; padding:8px 0; border-bottom:1px solid #ededeb;">
          <span style="color:#666a70; font-size:13px;">${escapeHtml(label)}</span>
          <strong style="color:#111111; font-size:14px; text-align:right;">${escapeHtml(value)}</strong>
        </div>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Inter, system-ui, -apple-system, sans-serif; background:#f7f7f5; margin:0; padding:24px;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #dedfda; border-radius:12px; overflow:hidden;">
    <div style="padding:20px 24px; background:#111111; color:#ffffff; font-weight:900; letter-spacing:1.8px; text-align:center;">SUPERCAR DASH</div>
    <div style="padding:24px;">
      <div style="font-size:12px; color:#666a70; font-weight:800; text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
      <h1 style="margin:6px 0 12px; font-size:22px; line-height:1.2; color:#111111;">${escapeHtml(headline)}</h1>
      <p style="margin:0 0 18px; color:#34373b; font-size:14px; line-height:1.55;">Hello Shiv, ${escapeHtml(body)}</p>
      <div style="border:1px solid #ededeb; border-radius:8px; padding:14px; background:#fafafa;">
        ${detailsHtml}
      </div>
      <div style="margin-top:22px; text-align:center;">
        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block; padding:12px 22px; background:#111111; color:#ffffff; text-decoration:none; border-radius:6px; font-size:14px; font-weight:800;">${escapeHtml(ctaLabel)}</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `SUPERCAR DASH

${eyebrow}

Hello Shiv,

${body}

${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}

${ctaLabel}: ${ctaUrl}
`;

  return {
    key,
    eyebrow,
    from: mailFrom,
    subject,
    audience,
    trigger,
    sampleData: rows.map(([label, value]) => `${label}: ${value}`),
    html,
    text,
  };
}

export function getMarketingEmailPreviews(): MarketingEmailPreview[] {
  const transactionPreview = generateEmailTemplate({
    templateType: "DEALER_PURCHASE_REQUEST",
    recipientName: "Ferrari Miami",
    recipientEmail: "sales@ferrarifl.com",
    packageTitle: "Qualified buyer purchase request",
    vehicleSummary: "2024 Ferrari Roma Spider (VIN: ZFF02RPA1R0291123)",
    priceOrAmount: 309900,
    reviewUrl: "/fulfillment/demo-token",
    acceptUrl: "/fulfillment/demo-token/accept",
    declineUrl: "/fulfillment/demo-token/decline",
    expirationDate: "7 days from issue date",
    additionalDetails: {
      Buyer: "Shiv Kalola",
      "Buyer Email": "shiv@example.com",
      Phone: "(704) 555-0188",
      "Deposit Status": "Ready at final checkout step",
    },
  });

  const previews: MarketingEmailPreview[] = [
    buildTrackerEmailPreview({
      key: "price_tracking_alerts",
      eyebrow: "Price tracker alert",
      subject: "[SUPERCAR DASH] Price Drop Alert - 2024 Ferrari Roma Spider",
      headline: "2024 Ferrari Roma Spider",
      body: "a saved Ferrari Roma listing dropped from $329,900 to $309,900.",
      ctaLabel: "View Listing",
      ctaUrl: `${appUrl}/vehicle/ZFF02RPA1R0291123`,
      rows: [
        ["Current price", "$309,900"],
        ["Previous price", "$329,900"],
        ["Dealer", "Ferrari Miami"],
        ["Location", "Miami, FL"],
      ],
      audience: "Users with price tracker enabled for a saved make/model.",
      trigger: "A live VIN-backed listing price falls below the user's tracker baseline.",
    }),
    buildTrackerEmailPreview({
      key: "listing_tracker_alerts",
      eyebrow: "New listing tracker alert",
      subject: "[SUPERCAR DASH] New Listing Alert - 2025 Lamborghini Revuelto",
      headline: "2025 Lamborghini Revuelto",
      body: "a new Lamborghini Revuelto listing was added to SUPERCAR DASH.",
      ctaLabel: "View Listing",
      ctaUrl: `${appUrl}/vehicle/ZHWUC1ZM5SLA12345`,
      rows: [
        ["Price", "$689,995"],
        ["Dealer", "Lamborghini Dallas"],
        ["Location", "Richardson, TX"],
        ["Mileage", "428 miles"],
      ],
      audience: "Users with listing tracker enabled for a saved make/model.",
      trigger: "A new public inventory listing matches a saved vehicle model.",
    }),
    buildTrackerEmailPreview({
      key: "maintenance_alerts",
      eyebrow: "Maintenance tracker",
      subject: "[SUPERCAR DASH] Maintenance Alert - 2021 McLaren 720S",
      headline: "2021 McLaren 720S",
      body: "annual service is due soon for your 2021 McLaren 720S. Vehicle Passport recommends service at 12 months or 10,000 miles.",
      ctaLabel: "Open Vehicle Passport",
      ctaUrl: `${appUrl}/vehicle/SBM14DCA8MW765432`,
      rows: [
        ["Service", "Annual service"],
        ["Status", "Due soon"],
        ["Recommended at", "12 months or 10,000 miles"],
        ["Next action", "Book certified service"],
      ],
      audience: "Owners with maintenance tracker enabled for a claimed VIN-backed vehicle.",
      trigger: "Vehicle Passport maintenance signals indicate service is due or coming due.",
    }),
    {
      key: "transaction_flow_alerts",
      eyebrow: "Transaction flow",
      from: mailFrom,
      subject: transactionPreview.subject,
      audience: "Dealers, sellers, service shops, transporters, insurers, buyers, and owners tied to a request.",
      trigger: "A fulfillment request is created, accepted, declined, cancelled, refunded, expired, or completed.",
      sampleData: [
        "Request: Dealer purchase",
        "Vehicle: 2024 Ferrari Roma Spider",
        "Amount: $309,900",
        "Decision window: 7 days",
      ],
      html: transactionPreview.html,
      text: transactionPreview.text,
    },
    buildTrackerEmailPreview({
      key: "welcome_emails",
      eyebrow: "Welcome",
      subject: "[SUPERCAR DASH] Welcome to your supercar command center",
      headline: "Welcome to SUPERCAR DASH",
      body: "your account is ready. You can save vehicles, track listings, manage claimed cars, and follow transaction activity from your profile.",
      ctaLabel: "Open Profile",
      ctaUrl: `${appUrl}/garage/shiv`,
      rows: [
        ["Profile", "shiv"],
        ["Garage", "Saved and claimed vehicles"],
        ["Trackers", "Listings, price, maintenance, and events"],
      ],
      audience: "Newly created user accounts after sign-in or onboarding.",
      trigger: "A new buyer or owner account is created and welcome automation is enabled.",
    }),
  ];

  return previews;
}
