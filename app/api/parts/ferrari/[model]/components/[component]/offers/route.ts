import { after, NextRequest, NextResponse } from "next/server";
import { getFerrariComponentOffers } from "@/lib/parts/ferrari-component-service";

type RouteParams = { params: Promise<{ model: string; component: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { model, component } = await params;
  const yearValue = Number.parseInt(request.nextUrl.searchParams.get("year") || "", 10);
  const year = Number.isFinite(yearValue) && yearValue >= 1947 && yearValue <= new Date().getFullYear() + 2 ? yearValue : null;
  const categorySlug = clean(request.nextUrl.searchParams.get("category"));
  try {
    let result = await getFerrariComponentOffers({
      modelSlug: model.slice(0, 100),
      componentSlug: component.slice(0, 100),
      categorySlug,
      year,
      cacheOnly: true,
    });
    if (!result) return NextResponse.json({ error: "Ferrari component mapping not found." }, { status: 404 });
    const lastSearchedAt = result.cache.lastSearchedAt ? new Date(result.cache.lastSearchedAt).getTime() : 0;
    const isStale = Date.now() - lastSearchedAt > result.cache.ttlSeconds * 1_000;
    if (result.offers.length === 0 && result.cache.status !== "RUNNING") {
      result = await getFerrariComponentOffers({
        modelSlug: model.slice(0, 100),
        componentSlug: component.slice(0, 100),
        categorySlug,
        year,
        forceRefresh: true,
      });
      if (!result) return NextResponse.json({ error: "Ferrari component mapping not found." }, { status: 404 });
    } else if (isStale && result.cache.status !== "RUNNING") {
      after(async () => {
        try {
          await getFerrariComponentOffers({
            modelSlug: model.slice(0, 100),
            componentSlug: component.slice(0, 100),
            categorySlug,
            year,
            forceRefresh: true,
          });
        } catch (error) {
          console.error("Background Ferrari component refresh failed", error);
        }
      });
    }
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": result.offers.length > 0
          ? "public, s-maxage=300, stale-while-revalidate=43200"
          : "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Ferrari component offer search failed", error);
    return NextResponse.json({ error: "Live offers are temporarily unavailable." }, { status: 502 });
  }
}

function clean(value: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 100) : undefined;
}
