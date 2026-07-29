import { NextRequest } from "next/server";

type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
  source: string;
};

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return Response.json({ result: null }, { headers: cacheHeaders() });
  }

  const result = await geocodeLocation(q);
  return Response.json({ result }, { headers: cacheHeaders() });
}

async function geocodeLocation(query: string): Promise<GeocodeResult | null> {
  const zip = query.match(/\b\d{5}\b/)?.[0];

  if (zip) {
    const zipResult = await geocodeZipCode(zip);
    if (zipResult) return zipResult;
  }

  const censusResult = await geocodeWithCensus(query);
  if (censusResult) return censusResult;

  return null;
}

async function geocodeZipCode(zip: string): Promise<GeocodeResult | null> {
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, {
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      "post code"?: string;
      places?: Array<{
        "place name"?: string;
        state?: string;
        "state abbreviation"?: string;
        latitude?: string;
        longitude?: string;
      }>;
    };
    const place = data.places?.[0];
    const latitude = Number(place?.latitude);
    const longitude = Number(place?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const cityState = [place?.["place name"], place?.["state abbreviation"]].filter(Boolean).join(", ");
    return {
      label: `${zip}${cityState ? ` (${cityState})` : ""}`,
      latitude,
      longitude,
      source: "zippopotam",
    };
  } catch {
    return null;
  }
}

function cacheHeaders() {
  return {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };
}

async function geocodeWithCensus(query: string): Promise<GeocodeResult | null> {
  try {
    const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
    url.searchParams.set("address", `${query}, USA`);
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("format", "json");

    const response = await fetch(url, {
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      result?: {
        addressMatches?: Array<{
          matchedAddress?: string;
          coordinates?: {
            x?: number;
            y?: number;
          };
        }>;
      };
    };
    const match = data.result?.addressMatches?.[0];
    const latitude = Number(match?.coordinates?.y);
    const longitude = Number(match?.coordinates?.x);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      label: match?.matchedAddress || query,
      latitude,
      longitude,
      source: "census",
    };
  } catch {
    return null;
  }
}
