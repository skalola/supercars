import https from "node:https";
import { buildSalesEmailForWebsite, getHostname, isMarketplaceHostname } from "@/lib/directory/contact-domain-policy";
import { normalizePartnerLocation, normalizePhoneNumber } from "@/lib/directory/partner-contact-format";
import { isValidEmail } from "@/lib/fulfillment/partner-registry";

export type DealerContactDiscoveryInput = {
  dealerName: string;
  make: string;
  listingUrl?: string | null;
  sourceWebsite?: string | null;
  location?: string | null;
};

export type DealerContactDiscoveryResult = {
  verified: boolean;
  dealerName: string;
  make: string;
  website: string | null;
  sourceUrl: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  streetAddress: string | null;
  reason:
    | "VERIFIED_EMAIL_PHONE"
    | "SALES_DOMAIN_FALLBACK"
    | "MISSING_EMAIL"
    | "MISSING_PHONE"
    | "WEBSITE_UNREACHABLE";
};

const USER_AGENT = "Mozilla/5.0 (compatible; SUPERCARDASHDealerContactDiscovery/0.1; +https://supercardash.vercel.app)";
const CONTACT_PATHS = [
  "",
  "contact-us",
  "contact",
  "contactus",
  "contact.htm",
  "contact-us.htm",
  "contact-lamborghini",
  "dealership/contact.htm",
  "dealership/staff.htm",
  "about-us",
  "locations",
  "sales",
  "inventory",
];

export async function discoverDealerContactFromInventory(
  input: DealerContactDiscoveryInput,
): Promise<DealerContactDiscoveryResult> {
  const location = normalizePartnerLocation({ location: input.location });
  const urls = buildCandidateUrls(input);
  const queued = [...urls];
  const seen = new Set<string>();
  let best: DealerContactDiscoveryResult = emptyResult(input, location);

  for (const url of queued) {
    if (seen.has(url) || seen.size > 50) continue;
    seen.add(url);

    const loaded = await fetchPublicHtml(url);
    if (!loaded.ok || !loaded.html) continue;

    for (const dealerUrl of extractDealerLinks(loaded.html, loaded.url || url, input.dealerName)) {
      for (const candidate of expandContactUrls(dealerUrl)) {
        if (!seen.has(candidate) && !queued.includes(candidate)) queued.push(candidate);
      }
    }

    const loadedDomain = getHostname(loaded.url || url);
    const extracted = isMarketplaceHostname(loadedDomain)
      ? { email: null, phone: null, streetAddress: null, city: null, state: null, postalCode: null }
      : extractDealerContact(loaded.html, input.dealerName);
    const merged: DealerContactDiscoveryResult = {
      ...best,
      website: originFromUrl(loaded.url || url),
      sourceUrl: loaded.url || url,
      email: best.email || extracted.email,
      phone: best.phone || extracted.phone,
      streetAddress: best.streetAddress || extracted.streetAddress || location.streetAddress,
      city: best.city || extracted.city || location.city,
      state: best.state || extracted.state || location.state,
      postalCode: best.postalCode || extracted.postalCode || location.postalCode,
      location: null,
      reason: "WEBSITE_UNREACHABLE",
    };
    if (!merged.email && merged.website) {
      merged.email = buildSalesEmailForWebsite(merged.website);
    }
    merged.location = normalizePartnerLocation(merged).location;
    merged.verified = Boolean(merged.email && merged.website);
    merged.reason = merged.verified
      ? merged.phone
        ? "VERIFIED_EMAIL_PHONE"
        : "SALES_DOMAIN_FALLBACK"
      : merged.phone
        ? "MISSING_EMAIL"
        : "MISSING_PHONE";
    best = scoreResult(merged) > scoreResult(best) ? merged : best;

    if (best.verified && /\/contact/i.test(best.sourceUrl || "")) break;
  }

  return best.website
    ? best
    : { ...best, reason: "WEBSITE_UNREACHABLE" };
}

function emptyResult(
  input: DealerContactDiscoveryInput,
  location: ReturnType<typeof normalizePartnerLocation>,
): DealerContactDiscoveryResult {
  return {
    verified: false,
    dealerName: input.dealerName,
    make: input.make,
    website: null,
    sourceUrl: null,
    email: null,
    phone: null,
    location: location.location,
    city: location.city,
    state: location.state,
    postalCode: location.postalCode,
    streetAddress: location.streetAddress,
    reason: "WEBSITE_UNREACHABLE",
  };
}

function buildCandidateUrls(input: DealerContactDiscoveryInput) {
  const baseUrls = [input.sourceWebsite, input.listingUrl]
    .filter((url): url is string => Boolean(url && !isLikelyFakeUrl(url)))
    .flatMap((url) => {
      const origin = originFromUrl(url);
      return [url, origin].filter((candidate): candidate is string => Boolean(candidate));
    });

  const expanded = baseUrls.flatMap(expandContactUrls);

  return Array.from(new Set(expanded)).filter((url) => !isGenericManufacturerContactUrl(url));
}

function expandContactUrls(base: string) {
  const normalized = base.replace(/\/$/, "");
  const origin = originFromUrl(normalized);
  const bases = Array.from(new Set([
    normalized,
    shouldExpandOrigin(normalized) ? origin : null,
  ].filter((url): url is string => Boolean(url))));
  return bases.flatMap((candidateBase) =>
    CONTACT_PATHS.map((path) => path ? `${candidateBase.replace(/\/$/, "")}/${path}` : candidateBase),
  );
}

function shouldExpandOrigin(value: string) {
  try {
    const parsed = new URL(value);
    if (/lamborghini\.com$/i.test(parsed.hostname) && /\/dealerships\//i.test(parsed.pathname)) return false;
    if (/ferraridealers\.com$/i.test(parsed.hostname) && /^\/[a-z]{2}-[A-Z]{2}/.test(parsed.pathname)) return false;
    return parsed.pathname !== "/" && parsed.pathname !== "";
  } catch {
    return false;
  }
}

function extractDealerLinks(html: string, baseUrl: string, dealerName: string) {
  const baseDomain = domainFromUrl(baseUrl);
  const dealerTokens = dealerName
    .toLowerCase()
    .replace(/\b(ferrari|lamborghini|mclaren|mcclaren|of|the|inc|llc|dba|service|dealer)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
  const links = Array.from(html.matchAll(/href=["']([^"']+)["']/gi))
    .map((match) => absolutizeUrl(match[1], baseUrl))
    .filter((url): url is string => Boolean(url && !isLikelyFakeUrl(url)));

  return Array.from(new Set(links.filter((url) => {
    const domain = domainFromUrl(url);
    if (!domain || domain === baseDomain || isMarketplaceDomain(domain)) return false;
    const normalizedUrl = url.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return dealerTokens.length === 0 || dealerTokens.some((token) => normalizedUrl.includes(token));
  })));
}

function extractDealerContact(html: string, dealerName: string) {
  const text = htmlToText(html);
  const emails = extractEmails(html);
  const phone = extractPhone(text);
  const location = normalizePartnerLocation({ location: text });

  return {
    email: chooseBestEmail(emails, dealerName),
    phone,
    ...location,
  };
}

function extractEmails(html: string) {
  const mailto = Array.from(html.matchAll(/mailto:([^"'>?\s]+)/gi)).map((match) => decodeURIComponent(match[1]));
  const visible = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set([...mailto, ...visible].map((email) => email.toLowerCase()).filter(isDirectoryEmail)));
}

function chooseBestEmail(emails: string[], dealerName: string) {
  if (emails.length === 0) return null;
  const domainHint = dealerName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const scored = emails.map((email) => ({
    email,
    score:
      (/^(sales|info|general|contact|internet|showroom)@/i.test(email) ? 40 : 0) +
      (/^(service|parts)@/i.test(email) ? 10 : 0) +
      (domainHint && email.replace(/[^a-z0-9]+/g, "").includes(domainHint.slice(0, 10)) ? 10 : 0),
  }));
  scored.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
  return scored[0]?.email || null;
}

function isDirectoryEmail(email: string) {
  return isValidEmail(email) &&
    !/^(privacy|legal|abuse|support|careers|jobs|noreply|donotreply)@/i.test(email) &&
    !/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email);
}

function extractPhone(text: string) {
  const matches = text.match(/(?:\+1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || [];
  const valid = matches.find((match) => {
    const digits = match.replace(/\D/g, "");
    const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    return national.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(national);
  });
  return normalizePhoneNumber(valid);
}

async function fetchPublicHtml(url: string): Promise<{ ok: boolean; status: number | null; html: string | null; url: string | null }> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    const html = await response.text();
    return {
      ok: response.ok && !isBotBlock(html),
      status: response.status,
      html,
      url: response.url || url,
    };
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
        fetchPublicHtmlInsecure(new URL(redirectLocation, url).toString(), redirects + 1).then(resolve);
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

function scoreResult(result: DealerContactDiscoveryResult) {
  let score = 0;
  if (result.email) score += 50;
  if (result.phone) score += 30;
  if (result.city && result.state) score += 10;
  if (result.website) score += 5;
  if (/sales@/i.test(result.email || "")) score += 10;
  if (/\/contact/i.test(result.sourceUrl || "")) score += 5;
  return score;
}

function htmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function originFromUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function domainFromUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function absolutizeUrl(value: string, baseUrl: string) {
  if (/^(mailto:|tel:|javascript:|#)/i.test(value)) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function isMarketplaceDomain(domain: string) {
  return /(^|\.)dupontregistry\.com$|(^|\.)autotrader\.com$|(^|\.)cars\.com$|(^|\.)bringatrailer\.com$|(^|\.)ferrari\.com$|(^|\.)preowned\.ferrari\.com$|(^|\.)lamborghini\.com$|(^|\.)preowned\.lamborghini\.com$|(^|\.)mclaren\.com$|(^|\.)preowned\.mclaren\.com$/i.test(domain);
}

function isGenericManufacturerContactUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (
      /(^|\.)lamborghini\.com$/i.test(parsed.hostname) &&
      /\/contact-us\/?$/i.test(parsed.pathname)
    ) || (
      /(^|\.)ferrari\.com$/i.test(parsed.hostname) &&
      /\/contact/i.test(parsed.pathname)
    ) || (
      /(^|\.)mclaren\.com$/i.test(parsed.hostname) &&
      /\/contact/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function isLikelyFakeUrl(value?: string | null) {
  if (!value) return true;
  return /(?:^|[./-])example(?:[./-]|$)|\.(test|invalid)(?:\/|$)|localhost|127\.0\.0\.1/i.test(value);
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
