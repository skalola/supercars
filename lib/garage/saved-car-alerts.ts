import { prisma } from "@/lib/prisma";
import { isValidEmail } from "@/lib/fulfillment/partner-registry";
import { shouldSendMarketingAutomation } from "@/lib/admin/marketing-automation";

type AlertKind = "price" | "listing";

type AlertListing = {
  id: string;
  modelId: string;
  year: number;
  price: number | null;
  askingPrice: number | null;
  mileage: number | null;
  dealerName: string | null;
  location: string | null;
  url: string | null;
  model: {
    name: string;
    slug: string;
    make: {
      name: string;
      slug: string;
    };
  };
};

type ProviderSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
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

function getMailProvider() {
  const provider = (process.env.MAIL_PROVIDER || "log").trim().toLowerCase();
  return provider === "resend" ? "resend" : "log";
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ id?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let parsed: { id?: string; message?: string; errors?: unknown } = {};
  if (responseText) {
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = { message: responseText.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const reason = parsed.message || JSON.stringify(parsed.errors || parsed).slice(0, 500) || response.statusText;
    throw new Error(`${response.status} ${response.statusText}: ${reason}`);
  }

  return parsed;
}

async function sendSavedCarAlertEmail(input: ProviderSendInput) {
  const provider = getMailProvider();

  if (provider === "log") {
    console.log(`[Saved Car Alert] ${input.subject} -> ${input.to}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is required when MAIL_PROVIDER=resend.");

  await postJson(
    "https://api.resend.com/emails",
    { authorization: `Bearer ${apiKey}` },
    {
      from: getFromAddress(),
      to: [input.to],
      reply_to: process.env.MAIL_REPLY_TO || process.env.SUPPORT_EMAIL || "support@supercars.market",
      subject: input.subject,
      html: input.html,
      text: input.text,
    },
  );
}

export async function notifySavedCarNewListing(listingId: string) {
  const gate = await shouldSendMarketingAutomation("listing_tracker_alerts");
  if (!gate.enabled) return { sent: 0, skipped: gate.skipped };

  const listing = await getAlertListing(listingId);
  if (!listing) return { sent: 0, skipped: "listing_not_found" };

  return notifySavedCarSubscribers({
    kind: "listing",
    listing,
  });
}

export async function notifySavedCarPriceDrop(listingId: string, previousPrice: number, currentPrice: number) {
  if (currentPrice >= previousPrice) return { sent: 0, skipped: "not_a_price_drop" };

  const gate = await shouldSendMarketingAutomation("price_tracking_alerts");
  if (!gate.enabled) return { sent: 0, skipped: gate.skipped };

  const listing = await getAlertListing(listingId);
  if (!listing) return { sent: 0, skipped: "listing_not_found" };

  return notifySavedCarSubscribers({
    kind: "price",
    listing,
    previousPrice,
    currentPrice,
  });
}

async function getAlertListing(listingId: string): Promise<AlertListing | null> {
  return prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      modelId: true,
      year: true,
      price: true,
      askingPrice: true,
      mileage: true,
      dealerName: true,
      location: true,
      url: true,
      model: {
        select: {
          name: true,
          slug: true,
          make: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });
}

async function notifySavedCarSubscribers({
  kind,
  listing,
  previousPrice,
  currentPrice,
}: {
  kind: AlertKind;
  listing: AlertListing;
  previousPrice?: number;
  currentPrice?: number;
}) {
  const subscribers = await prisma.garageItem.findMany({
    where: {
      modelId: listing.modelId,
      ...(kind === "price"
        ? { priceTrackerAlertsEnabled: true }
        : { listingTrackerAlertsEnabled: true }),
      user: {
        email: { not: null },
      },
    },
    select: {
      id: true,
      priceTrackerBaseline: true,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
        },
      },
    },
  });

  let sent = 0;

  for (const subscriber of subscribers) {
    if (!isValidEmail(subscriber.user.email)) continue;

    const displayPrice = currentPrice ?? listing.askingPrice ?? listing.price ?? null;
    if (
      kind === "price" &&
      displayPrice !== null &&
      subscriber.priceTrackerBaseline !== null &&
      displayPrice >= subscriber.priceTrackerBaseline
    ) {
      continue;
    }

    const email = buildSavedCarAlertEmail({
      kind,
      listing,
      recipientName: subscriber.user.name || subscriber.user.username || "there",
      previousPrice,
      currentPrice: displayPrice,
    });

    await sendSavedCarAlertEmail({
      to: subscriber.user.email!,
      ...email,
    });

    await prisma.garageItem.update({
      where: { id: subscriber.id },
      data:
        kind === "price"
          ? {
              lastPriceAlertAt: new Date(),
              priceTrackerBaseline: displayPrice,
            }
          : {
              lastListingAlertAt: new Date(),
            },
    });

    sent++;
  }

  return { sent };
}

function buildSavedCarAlertEmail({
  kind,
  listing,
  recipientName,
  previousPrice,
  currentPrice,
}: {
  kind: AlertKind;
  listing: AlertListing;
  recipientName: string;
  previousPrice?: number;
  currentPrice: number | null;
}) {
  const vehicleLabel = `${listing.year} ${listing.model.make.name} ${listing.model.name}`;
  const modelUrl = `${getAppBaseUrl()}/make/${listing.model.make.slug}/${listing.model.slug}`;
  const listingUrl = listing.url || modelUrl;
  const priceText = currentPrice ? `$${currentPrice.toLocaleString()}` : "Price unavailable";
  const previousPriceText = previousPrice ? `$${previousPrice.toLocaleString()}` : null;
  const subject =
    kind === "price"
      ? `[SUPERCAR DASH] Price Drop Alert — ${vehicleLabel}`
      : `[SUPERCAR DASH] New Listing Alert — ${vehicleLabel}`;
  const headline = kind === "price" ? "Price tracker alert" : "New listing tracker alert";
  const body =
    kind === "price" && previousPriceText
      ? `A saved ${listing.model.make.name} ${listing.model.name} listing dropped from ${previousPriceText} to ${priceText}.`
      : `A new ${listing.model.make.name} ${listing.model.name} listing was added to SUPERCAR DASH.`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Inter, system-ui, -apple-system, sans-serif; background:#f7f7f5; margin:0; padding:24px;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #dedfda; border-radius:12px; overflow:hidden;">
    <div style="padding:20px 24px; background:#111111; color:#ffffff; font-weight:900; letter-spacing:1.8px; text-align:center;">SUPERCAR DASH</div>
    <div style="padding:24px;">
      <div style="font-size:12px; color:#666a70; font-weight:800; text-transform:uppercase;">${escapeHtml(headline)}</div>
      <h1 style="margin:6px 0 12px; font-size:22px; line-height:1.2; color:#111111;">${escapeHtml(vehicleLabel)}</h1>
      <p style="margin:0 0 18px; color:#34373b; font-size:14px; line-height:1.55;">Hello ${escapeHtml(recipientName)}, ${escapeHtml(body)}</p>
      <div style="border:1px solid #ededeb; border-radius:8px; padding:14px; background:#fafafa;">
        <div style="display:flex; justify-content:space-between; gap:16px; padding:7px 0;"><span style="color:#666a70;">Price</span><strong>${escapeHtml(priceText)}</strong></div>
        <div style="display:flex; justify-content:space-between; gap:16px; padding:7px 0;"><span style="color:#666a70;">Dealer</span><strong>${escapeHtml(listing.dealerName || "Not published")}</strong></div>
        <div style="display:flex; justify-content:space-between; gap:16px; padding:7px 0;"><span style="color:#666a70;">Location</span><strong>${escapeHtml(listing.location || "Not published")}</strong></div>
      </div>
      <div style="margin-top:22px; text-align:center;">
        <a href="${escapeHtml(listingUrl)}" style="display:inline-block; padding:12px 22px; background:#111111; color:#ffffff; text-decoration:none; border-radius:6px; font-size:14px; font-weight:800;">View Listing</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `SUPERCAR DASH

${headline}

Hello ${recipientName},

${body}

Vehicle: ${vehicleLabel}
Price: ${priceText}
Dealer: ${listing.dealerName || "Not published"}
Location: ${listing.location || "Not published"}

View listing: ${listingUrl}
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
