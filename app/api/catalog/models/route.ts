import { NextRequest, NextResponse } from "next/server";
import { getCatalogModelsByMakeIds } from "@/lib/makes/catalog";

const MAX_MAKES_PER_REQUEST = 100;

export async function GET(request: NextRequest) {
  const makeIds = Array.from(new Set(
    request.nextUrl.searchParams
      .getAll("makeId")
      .map((value) => value.trim())
      .filter(Boolean),
  )).slice(0, MAX_MAKES_PER_REQUEST);

  if (makeIds.length === 0) {
    return NextResponse.json({ models: [] }, { headers: cacheHeaders() });
  }

  const models = await getCatalogModelsByMakeIds(makeIds.sort());
  return NextResponse.json({ models }, { headers: cacheHeaders() });
}

function cacheHeaders() {
  return {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };
}
