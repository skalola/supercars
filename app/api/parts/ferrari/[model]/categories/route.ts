import { NextResponse } from "next/server";
import { getFerrariModelComponentCategories } from "@/lib/parts/ferrari-component-service";

type RouteParams = { params: Promise<{ model: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { model } = await params;
  const categories = await getFerrariModelComponentCategories(model.slice(0, 100));
  return NextResponse.json({ model, categories }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
