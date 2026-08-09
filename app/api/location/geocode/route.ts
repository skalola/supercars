import { NextRequest } from "next/server";
import { geocodeLocation } from "@/lib/location/geocode";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return Response.json({ result: null }, { headers: cacheHeaders() });
  }

  const result = await geocodeLocation(q);
  return Response.json({ result }, { headers: cacheHeaders() });
}

function cacheHeaders() {
  return {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };
}
