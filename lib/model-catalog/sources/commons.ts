export type CommonsImageMetadata = {
  imageUrl: string | null;
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  attributionUrl: string | null;
};

type CommonsImageInfoResponse = {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        url?: string;
        descriptionurl?: string;
        extmetadata?: Record<string, {
          value?: string;
        }>;
      }>;
    }>;
  };
};

export async function fetchCommonsImageMetadata(filenameOrUrl: string | null): Promise<CommonsImageMetadata | null> {
  const filename = getCommonsFilename(filenameOrUrl);
  if (!filename) return null;

  const params = new URLSearchParams({
    action: "query",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "extmetadata|url",
    format: "json",
    origin: "*",
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: {
      "User-Agent": "SUPERCAR-DASH-model-catalog/1.0 (contact: support@supercars.market)",
    },
  });

  if (!response.ok) {
    throw new Error(`Commons image metadata failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as CommonsImageInfoResponse;
  const imageInfo = Object.values(data.query?.pages || {})[0]?.imageinfo?.[0];
  if (!imageInfo) return null;

  const metadata = imageInfo.extmetadata || {};
  const licenseName = cleanMetadata(metadata.LicenseShortName?.value || metadata.License?.value);
  const licenseUrl = cleanMetadata(metadata.LicenseUrl?.value);
  const artist = cleanMetadata(metadata.Artist?.value);
  const credit = cleanMetadata(metadata.Credit?.value);
  const objectName = cleanMetadata(metadata.ObjectName?.value);
  const attribution = [artist, credit, objectName].find((value) => value && !/^own work$/i.test(value)) || objectName || artist || credit;

  return {
    imageUrl: imageInfo.url || null,
    sourceUrl: imageInfo.descriptionurl || null,
    license: licenseUrl && licenseName ? `${licenseName} (${licenseUrl})` : licenseName || licenseUrl || null,
    attribution: attribution || null,
    attributionUrl: imageInfo.descriptionurl || null,
  };
}

export function getCommonsFilename(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").map((part) => decodeURIComponent(part));
    const thumbIndex = parts.findIndex((part) => part === "thumb");
    if (thumbIndex >= 0 && parts.length > thumbIndex + 3) {
      return parts[thumbIndex + 3];
    }
    const lastPart = parts[parts.length - 1];
    return lastPart || null;
  } catch {
    return value.replace(/^File:/i, "").trim() || null;
  }
}

export function cleanMetadata(value: string | null | undefined) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim() || null;
}
