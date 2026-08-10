export type PartSourcePageMetadata = {
  resolvedUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  imageSource: "json_ld" | "og_image" | "twitter_image" | "html_image" | null;
};

const PLACEHOLDER_IMAGE_PATTERNS = [
  /placeholder/i,
  /coming[-_ ]?soon/i,
  /no[-_ ]?image/i,
  /logo/i,
  /icon/i,
  /sprite/i,
  /default/i,
  /_link\.(png|jpg|jpeg|webp)$/i,
  /carousel/i,
  /arrow/i,
  /chevron/i,
  /caret/i,
  /(?:^|[-_/])left(?:[-_.?/]|$)/i,
  /(?:^|[-_/])right(?:[-_.?/]|$)/i,
  /black\.png/i,
];

export async function fetchPartSourcePageMetadata(sourceUrl: string): Promise<PartSourcePageMetadata | null> {
  const response = await fetch(sourceUrl, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "SUPERCAR DASH part catalog enrichment (+https://supercardash.vercel.app)",
    },
    redirect: "follow",
  });

  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return null;

  const html = await response.text();
  const resolvedUrl = response.url || sourceUrl;
  const metadata: PartSourcePageMetadata = {
    resolvedUrl,
    title: firstCleanText([
      getMetaContent(html, "og:title"),
      getMetaContent(html, "twitter:title"),
      getTitle(html),
    ]),
    description: firstCleanText([
      getMetaContent(html, "og:description"),
      getMetaContent(html, "description"),
      getMetaContent(html, "twitter:description"),
    ]),
    imageUrl: null,
    imageSource: null,
  };

  const jsonLdImage = getJsonLdProductImage(html);
  const ogImage = getMetaContent(html, "og:image") || getMetaContent(html, "og:image:secure_url");
  const twitterImage = getMetaContent(html, "twitter:image");
  const htmlImage = getLikelyHtmlImage(html);

  const imageCandidates: Array<{ url: string | null; source: PartSourcePageMetadata["imageSource"] }> = [
    { url: jsonLdImage, source: "json_ld" },
    { url: ogImage, source: "og_image" },
    { url: twitterImage, source: "twitter_image" },
    { url: htmlImage, source: "html_image" },
  ];

  for (const candidate of imageCandidates) {
    const normalized = normalizeImageUrl(candidate.url, resolvedUrl);
    if (!normalized || isLowConfidencePartImageUrl(normalized)) continue;
    metadata.imageUrl = normalized;
    metadata.imageSource = candidate.source;
    break;
  }

  return metadata;
}

export function isLowConfidencePartImageUrl(url: string | null | undefined) {
  if (!url) return true;
  return PLACEHOLDER_IMAGE_PATTERNS.some((pattern) => pattern.test(url));
}

function getMetaContent(html: string, propertyOrName: string) {
  const escaped = escapeRegExp(propertyOrName);
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return null;
}

function getTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(stripTags(match[1])) : null;
}

function getJsonLdProductImage(html: string) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    const body = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(body);
      const image = findJsonLdImage(parsed);
      if (image) return image;
    } catch {
      continue;
    }
  }
  return null;
}

function findJsonLdImage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonLdImage(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const type = Array.isArray(record["@type"]) ? record["@type"].join(" ") : String(record["@type"] || "");
  if (/product/i.test(type) && record.image) {
    return findJsonLdImage(record.image);
  }
  if (record["@graph"]) return findJsonLdImage(record["@graph"]);
  return null;
}

function getLikelyHtmlImage(html: string) {
  const matches = html.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi);
  for (const match of matches) {
    const url = match[1];
    if (!url || isLowConfidencePartImageUrl(url)) continue;
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) return decodeHtml(url);
  }
  return null;
}

function normalizeImageUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) return null;
  const cleaned = decodeHtml(value).trim();
  if (!cleaned || cleaned.startsWith("data:")) return null;

  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function firstCleanText(values: Array<string | null | undefined>) {
  for (const value of values) {
    const cleaned = value?.replace(/\s+/g, " ").trim();
    if (cleaned) return cleaned;
  }
  return null;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
