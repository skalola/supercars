import { NextResponse } from "next/server";
import { getFerrariComponentModels } from "@/lib/parts/ferrari-component-service";

export async function GET() {
  const models = await getFerrariComponentModels();
  return NextResponse.json({ make: "Ferrari", models }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
