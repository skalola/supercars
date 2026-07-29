const stateNameToCode: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
  "puerto rico": "PR",
};

const stateCodes = new Set([
  ...Object.values(stateNameToCode),
  "AA",
  "AE",
  "AP",
  "AS",
  "GU",
  "MP",
  "PR",
  "VI",
]);

type LocationInput = {
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  location?: string | null;
};

type NormalizedLocation = {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  location: string | null;
};

export function normalizePartnerLocation(input: LocationInput): NormalizedLocation {
  const parsedFromCity = parseLocationText(input.city);
  const parsedFromLocation = parseLocationText(input.location);
  const state = normalizeState(input.state) || parsedFromCity.state || parsedFromLocation.state;
  const postalCode = normalizePostalCode(input.postalCode) || parsedFromCity.postalCode || parsedFromLocation.postalCode;
  const city = normalizeCity(input.city, state) || parsedFromLocation.city;
  const streetAddress = normalizeStreetAddress(input.streetAddress) || parsedFromCity.streetAddress || parsedFromLocation.streetAddress;

  return {
    streetAddress,
    city,
    state,
    postalCode,
    location: formatCityState(city, state),
  };
}

export function formatCityState(city?: string | null, state?: string | null) {
  const cleanCity = normalizeCity(city, state);
  const cleanState = normalizeState(state);
  if (cleanCity && cleanState) return `${cleanCity}, ${cleanState}`;
  return cleanCity || cleanState || null;
}

export function normalizePhoneNumber(value?: string | null) {
  if (!value) return null;
  const extension = value.match(/\b(?:ext\.?|x)\s*(\d{1,6})\b/i)?.[1];
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (national.length === 10) {
    const formatted = `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    return extension ? `${formatted} ext. ${extension}` : formatted;
  }

  return value.replace(/\s+/g, " ").trim() || null;
}

export function normalizeState(value?: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/\./g, "").trim();
  if (!cleaned) return null;

  const code = cleaned.match(/\b[A-Z]{2}\b/)?.[0];
  if (code && stateCodes.has(code)) return code;

  return stateNameToCode[cleaned.toLowerCase()] || null;
}

export function normalizeCity(value?: string | null, state?: string | null) {
  if (!value) return null;
  const cleanState = normalizeState(state);
  const parsed = parseLocationText(value);
  const candidate = parsed.city || value;
  const cleaned = titleCase(
    candidate
      .replace(/\b\d{5}(?:-\d{4})?\b/g, "")
      .replace(/\bUnited States\b|\bUSA\b/gi, "")
      .replace(new RegExp(`,?\\s*${cleanState || "[A-Z]{2}"}\\b`, "gi"), "")
      .replace(/\s*,\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );

  if (!cleaned || /\d|@|\.com/i.test(cleaned) || looksLikeStreetAddress(cleaned)) return null;
  return cleaned.length <= 64 ? cleaned : null;
}

export function normalizePostalCode(value?: string | null) {
  return value?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || null;
}

function normalizeStreetAddress(value?: string | null) {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned || !looksLikeStreetAddress(cleaned)) return null;
  return cleaned.replace(/\s*,\s*$/g, "");
}

function parseLocationText(value?: string | null) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return emptyParsedLocation();

  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  const lastStateZip = parts[parts.length - 1]?.match(/\b([A-Z]{2}|[A-Za-z ]{4,})\s+(\d{5}(?:-\d{4})?)?\b/);
  const inlineCityState = text.match(/\b([A-Za-z.' -]{2,64}?),\s*([A-Z]{2}|[A-Za-z ]{4,})(?:\s+(\d{5}(?:-\d{4})?))?\b/);
  const state = normalizeState(lastStateZip?.[1]) || normalizeState(inlineCityState?.[2]);
  const postalCode = normalizePostalCode(text);
  const cityPart = state && parts.length >= 2
    ? parts[parts.length - 2]
    : normalizeState(inlineCityState?.[2])
      ? inlineCityState?.[1]
      : null;
  const streetPart = parts.find((part) => looksLikeStreetAddress(part)) || null;

  return {
    streetAddress: normalizeStreetAddress(streetPart),
    city: cityPart ? titleCase(cityPart) : null,
    state,
    postalCode,
  };
}

function emptyParsedLocation() {
  return {
    streetAddress: null,
    city: null,
    state: null,
    postalCode: null,
  };
}

function looksLikeStreetAddress(value: string) {
  return /^\d{1,6}\s+[A-Za-z0-9.'# -]+/.test(value.trim());
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
