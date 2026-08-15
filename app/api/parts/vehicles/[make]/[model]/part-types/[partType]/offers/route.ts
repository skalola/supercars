import { after, NextRequest, NextResponse } from "next/server";
import { getAvailableOffers } from "@/lib/parts/vehicle-parts-service";

type RouteParams = { params: Promise<{ make: string; model: string; partType: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const values = await params;
  const makeSlug = clean(values.make);
  const modelSlug = clean(values.model);
  const componentSlug = clean(values.partType);
  const categorySlug = clean(request.nextUrl.searchParams.get("system") || "");
  if (!makeSlug || !modelSlug || !componentSlug || !categorySlug) {
    return NextResponse.json({ error: "Parts context is invalid." }, { status: 400 });
  }

  const parsedYear = Number.parseInt(request.nextUrl.searchParams.get("year") || "", 10);
  const year = Number.isFinite(parsedYear) && parsedYear >= 1886 && parsedYear <= new Date().getFullYear() + 2 ? parsedYear : null;
  const context = { makeSlug, modelSlug, componentSlug, categorySlug, year };

  try {
    let result = await getAvailableOffers({ ...context, cacheOnly: true });
    if (!result) return NextResponse.json({ error: "Vehicle part type mapping not found." }, { status: 404 });
    const lastSearchedAt = result.cache.lastSearchedAt ? new Date(result.cache.lastSearchedAt).getTime() : 0;
    const stale = Date.now() - lastSearchedAt > result.cache.ttlSeconds * 1_000;

    if (result.offers.length === 0 && result.cache.status !== "RUNNING") {
      result = await getAvailableOffers({ ...context, forceRefresh: true });
      if (!result) return NextResponse.json({ error: "Vehicle part type mapping not found." }, { status: 404 });
    } else if (stale && result.cache.status !== "RUNNING") {
      after(async () => {
        try {
          await getAvailableOffers({ ...context, forceRefresh: true });
        } catch (error) {
          console.error("Background part offer refresh failed", { makeSlug, modelSlug, componentSlug, error });
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
    console.error("Part offer search failed", { makeSlug, modelSlug, componentSlug, error });
    return NextResponse.json({ error: "Live offers are temporarily unavailable." }, { status: 502 });
  }
}

function clean(value: string) {
  const cleaned = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,100}$/.test(cleaned) ? cleaned : "";
}
