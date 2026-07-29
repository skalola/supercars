import https from "node:https";
import { isValidEmail } from "@/lib/fulfillment/partner-registry";
import { normalizePhoneNumber } from "@/lib/directory/partner-contact-format";

export type PartnerWebsiteVerificationInput = {
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  requirePublishedEmail?: boolean;
};

export type PartnerWebsiteVerificationResult = {
  ok: boolean;
  reason: "VERIFIED" | "VERIFIED_WITHOUT_EMAIL" | "MISSING_WEBSITE" | "MISSING_LOCATION" | "MISSING_PHONE" | "WEBSITE_UNREACHABLE" | "EMAIL_NOT_PUBLISHED" | "PHONE_NOT_PUBLISHED";
  status?: number | null;
  sourceUrl?: string | null;
  emailPublished?: boolean;
};

const USER_AGENT = "Mozilla/5.0 (compatible; SUPERCARDASHPartnerVerifier/0.1; +https://supercardash.vercel.app)";
const CONTACT_PATHS = ["", "contact-us", "contact", "locations", "about-us", "service"];

export async function verifyPartnerWebsiteContact(
  input: PartnerWebsiteVerificationInput,
): Promise<PartnerWebsiteVerificationResult> {
  if (!input.website) return { ok: false, reason: "MISSING_WEBSITE" };
  if (!input.city || !input.state) return { ok: false, reason: "MISSING_LOCATION" };
  if (!normalizePhoneNumber(input.phone)) return { ok: false, reason: "MISSING_PHONE" };

  let loaded: { ok: boolean; status: number | null; html: string | null; url: string | null } | null = null;
  let emailPublished = !input.email;
  let phonePublished = false;
  let lastStatus: number | null = null;
  const expectedPhone = normalizePhoneDigits(input.phone);

  for (const url of buildCandidateUrls(input.website)) {
    const candidate = await fetchPublicHtml(url);
    lastStatus = candidate.status;
    if (!candidate.ok || !candidate.html) continue;

    loaded = candidate;
    const text = htmlToText(candidate.html);
    emailPublished = emailPublished || Boolean(input.email && text.toLowerCase().includes(input.email.toLowerCase()));
    const pagePhoneDigits = normalizePhoneDigits(text);
    phonePublished = phonePublished || Boolean(expectedPhone && pagePhoneDigits?.includes(expectedPhone));

    if (emailPublished && phonePublished) {
      return {
        ok: true,
        reason: isValidEmail(input.email) ? "VERIFIED" : "VERIFIED_WITHOUT_EMAIL",
        status: candidate.status,
        sourceUrl: candidate.url,
        emailPublished: isValidEmail(input.email),
      };
    }
  }

  if (!loaded?.ok || !loaded.html) {
    return { ok: false, reason: "WEBSITE_UNREACHABLE", status: lastStatus };
  }

  if (input.requirePublishedEmail && input.email && !emailPublished) {
    return { ok: false, reason: "EMAIL_NOT_PUBLISHED", status: loaded.status, sourceUrl: loaded.url };
  }

  if (phonePublished) {
    return {
      ok: true,
      reason: "VERIFIED_WITHOUT_EMAIL",
      status: loaded.status,
      sourceUrl: loaded.url,
      emailPublished: false,
    };
  }

  return { ok: false, reason: "PHONE_NOT_PUBLISHED", status: loaded.status, sourceUrl: loaded.url };
}

function buildCandidateUrls(website: string) {
  try {
    const parsed = new URL(website);
    const root = `${parsed.protocol}//${parsed.host}`;
    const basePath = parsed.pathname.replace(/\/$/, "");
    const bases = Array.from(new Set([root, basePath ? `${root}${basePath}` : root]));

    return Array.from(new Set(
      bases.flatMap((base) =>
        CONTACT_PATHS.map((path) => path ? `${base}/${path}` : base),
      ),
    ));
  } catch {
    return [];
  }
}

async function fetchPublicHtml(url: string): Promise<{ ok: boolean; status: number | null; html: string | null; url: string | null }> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    const html = await response.text();
    if (response.ok && !isBotBlock(html)) {
      return { ok: true, status: response.status, html, url: response.url || url };
    }
    return { ok: false, status: response.status, html: null, url: response.url || url };
  } catch {
    return fetchPublicHtmlInsecure(url);
  }
}

async function fetchPublicHtmlInsecure(url: string, redirects = 0): Promise<{ ok: boolean; status: number | null; html: string | null; url: string | null }> {
  return new Promise((resolve) => {
    const request = https.get(url, {
      headers: { "user-agent": USER_AGENT },
      rejectUnauthorized: false,
    }, (response) => {
      const status = response.statusCode || null;
      const redirectLocation = response.headers.location;
      if (status && status >= 300 && status < 400 && redirectLocation && redirects < 5) {
        response.resume();
        const nextUrl = new URL(redirectLocation, url).toString();
        fetchPublicHtmlInsecure(nextUrl, redirects + 1).then(resolve);
        return;
      }

      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const html = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: Boolean(status && status >= 200 && status < 300 && !isBotBlock(html)),
          status,
          html,
          url,
        });
      });
    });

    request.setTimeout(12_000, () => {
      request.destroy();
      resolve({ ok: false, status: null, html: null, url });
    });
    request.on("error", () => resolve({ ok: false, status: null, html: null, url }));
  });
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function normalizePhoneDigits(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function isBotBlock(text: string) {
  return /Human Verification|Access Denied|enable javascript and cookies/i.test(text);
}

function decodeHtml(value: string) {
  return value
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ")
    .replace(/&nbsp;/g, " ");
}
