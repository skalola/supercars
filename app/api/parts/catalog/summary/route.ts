import { NextRequest, NextResponse } from "next/server";
import { queryPublicPartsStoreSummary } from "@/lib/parts/storefront";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const makeId = clean(params.get("make"));
  const modelId = clean(params.get("model"));
  if (!makeId && !modelId) {
    return NextResponse.json({ categoryCounts: {} });
  }

  const result = await queryPublicPartsStoreSummary({
    makeId,
    modelId,
  });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

function clean(value: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 100) : undefined;
}
