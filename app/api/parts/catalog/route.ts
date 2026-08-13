import { NextRequest, NextResponse } from "next/server";
import { queryPublicPartsStore } from "@/lib/parts/storefront";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Number.parseInt(params.get("page") || "1", 10);
  const result = await queryPublicPartsStore({
    categoryId: clean(params.get("category")),
    brandId: clean(params.get("brand")),
    makeId: clean(params.get("make")),
    modelId: clean(params.get("model")),
    search: clean(params.get("q")),
    page: Number.isFinite(page) ? page : 1,
  });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

function clean(value: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 100) : undefined;
}
