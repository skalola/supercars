import { NextResponse } from "next/server";
import { getFerrariModelComponents } from "@/lib/parts/ferrari-component-service";

type RouteParams = { params: Promise<{ model: string; category: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { model, category } = await params;
  const components = await getFerrariModelComponents(model.slice(0, 100), category.slice(0, 100));
  return NextResponse.json({ model, category, components }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
