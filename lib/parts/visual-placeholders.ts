const BRAND_BASE = "/parts/placeholders/brand";
const NODE_BASE = "/parts/placeholders/node";

const CATEGORY_COLORS: Record<string, { accent: string; glow: string }> = {
  intake: { accent: "#5eead4", glow: "#134e4a" },
  exhaust: { accent: "#fb7185", glow: "#7f1d1d" },
  "ecu-tuning": { accent: "#60a5fa", glow: "#1e3a8a" },
  "forced-induction": { accent: "#facc15", glow: "#713f12" },
  fueling: { accent: "#34d399", glow: "#064e3b" },
  cooling: { accent: "#38bdf8", glow: "#075985" },
  suspension: { accent: "#a78bfa", glow: "#4c1d95" },
  brakes: { accent: "#f97316", glow: "#7c2d12" },
  "wheels-tires": { accent: "#e5e7eb", glow: "#374151" },
  "aero-body": { accent: "#f43f5e", glow: "#881337" },
  drivetrain: { accent: "#c084fc", glow: "#581c87" },
  "interior-safety": { accent: "#f9a8d4", glow: "#831843" },
};

export function getBrandPlaceholderUrl(slug: string) {
  return `${BRAND_BASE}/${encodeURIComponent(slug)}`;
}

export function getCatalogNodePlaceholderUrl(slug: string, categorySlug?: string | null) {
  const params = categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : "";
  return `${NODE_BASE}/${encodeURIComponent(slug)}${params}`;
}

export function brandPlaceholderSvg(slug: string) {
  const label = titleFromSlug(slug);
  const initials = getInitials(label);
  const hue = hashHue(slug);
  const accent = `hsl(${hue} 94% 58%)`;
  const glow = `hsl(${hue} 78% 24%)`;

  return svgResponseString(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="${escapeXml(label)} placeholder brand mark">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0a0a0a"/>
          <stop offset="0.54" stop-color="#141414"/>
          <stop offset="1" stop-color="#050505"/>
        </linearGradient>
        <radialGradient id="glow" cx="58%" cy="46%" r="58%">
          <stop offset="0" stop-color="${glow}" stop-opacity="0.72"/>
          <stop offset="1" stop-color="${glow}" stop-opacity="0"/>
        </radialGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12"/>
        </filter>
      </defs>
      <rect width="640" height="360" rx="34" fill="url(#bg)"/>
      <rect width="640" height="360" rx="34" fill="url(#glow)"/>
      <path d="M74 248 C168 202 254 202 342 222 C424 240 492 230 566 188" fill="none" stroke="${accent}" stroke-opacity="0.36" stroke-width="3"/>
      <path d="M78 256 C176 218 256 222 340 240 C424 258 502 248 572 210" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1"/>
      <g transform="translate(66 62)">
        <rect x="0" y="0" width="112" height="112" rx="28" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.16"/>
        <text x="56" y="71" text-anchor="middle" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="38" font-weight="850" letter-spacing="2">${escapeXml(initials)}</text>
      </g>
      <text x="320" y="174" text-anchor="middle" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="${label.length > 18 ? 32 : 42}" font-style="italic" font-weight="850" letter-spacing="8">${escapeXml(label.toUpperCase())}</text>
      <text x="320" y="216" text-anchor="middle" fill="${accent}" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="850" letter-spacing="7">PARTNER MARK PLACEHOLDER</text>
      <rect x="28" y="28" width="584" height="304" rx="28" fill="none" stroke="#ffffff" stroke-opacity="0.11"/>
    </svg>
  `);
}

export function nodePlaceholderSvg(slug: string, categorySlug?: string | null) {
  const label = titleFromSlug(slug);
  const palette = CATEGORY_COLORS[categorySlug ?? ""] ?? { accent: "#ef4444", glow: "#450a0a" };
  const icon = iconForSlug(slug, categorySlug);

  return svgResponseString(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="${escapeXml(label)} placeholder part tile">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111111"/>
          <stop offset="0.52" stop-color="#050505"/>
          <stop offset="1" stop-color="#191919"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="44%" r="56%">
          <stop offset="0" stop-color="${palette.glow}" stop-opacity="0.8"/>
          <stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="640" height="360" rx="34" fill="url(#bg)"/>
      <rect width="640" height="360" rx="34" fill="url(#glow)"/>
      <rect x="32" y="32" width="576" height="296" rx="28" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.12"/>
      <g transform="translate(250 74)">
        <circle cx="70" cy="70" r="68" fill="#ffffff" fill-opacity="0.055" stroke="${palette.accent}" stroke-opacity="0.58" stroke-width="2"/>
        <text x="70" y="92" text-anchor="middle" fill="${palette.accent}" font-family="Inter,Arial,sans-serif" font-size="72" font-weight="850">${escapeXml(icon)}</text>
      </g>
      <text x="320" y="252" text-anchor="middle" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="${label.length > 24 ? 28 : 36}" font-weight="850" letter-spacing="3">${escapeXml(label.toUpperCase())}</text>
      <text x="320" y="287" text-anchor="middle" fill="${palette.accent}" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="850" letter-spacing="6">${escapeXml((categorySlug ?? "PART LIBRARY").replace(/-/g, " ").toUpperCase())}</text>
      <path d="M84 300 L194 300 M446 300 L556 300" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `);
}

export function svgHeaders() {
  return {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}

function svgResponseString(value: string) {
  return value.replace(/\n\s+/g, "");
}

function titleFromSlug(slug: string) {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "SUPERCAR DASH";
}

function getInitials(label: string) {
  const words = label.replace(/[^a-z0-9 ]/gi, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SD";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function hashHue(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }
  return hash;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function iconForSlug(slug: string, categorySlug?: string | null) {
  const value = `${slug} ${categorySlug ?? ""}`;
  if (/brake|rotor|caliper|pad/.test(value)) return "◉";
  if (/wheel|tire|stud|lug|spacer/.test(value)) return "◎";
  if (/turbo|boost|supercharger|intercooler|charge/.test(value)) return "↯";
  if (/exhaust|header|muffler|pipe|downpipe|catalytic/.test(value)) return "▱";
  if (/intake|air|filter|throttle|manifold/.test(value)) return "◌";
  if (/ecu|tuning|sensor|data|scanner|electrical/.test(value)) return "▣";
  if (/fuel|injector|pump|rail|tank/.test(value)) return "◆";
  if (/cool|radiator|water|oil|thermostat|fan/.test(value)) return "❄";
  if (/suspension|spring|coilover|shock|strut|arm|joint/.test(value)) return "⌁";
  if (/aero|body|hood|spoiler|splitter|diffuser|fender/.test(value)) return "▰";
  if (/drivetrain|clutch|transmission|differential|axle|shaft|gear/.test(value)) return "⚙";
  if (/seat|harness|interior|safety|cage|steering/.test(value)) return "◇";
  return "⬡";
}
