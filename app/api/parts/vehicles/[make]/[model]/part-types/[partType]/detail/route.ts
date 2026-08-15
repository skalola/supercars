import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getVehiclePartTypeDetail } from "@/lib/parts/part-detail-service";

type RouteParams = { params: Promise<{ make: string; model: string; partType: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const values = await params;
  const makeSlug = clean(values.make);
  const modelSlug = clean(values.model);
  const partTypeSlug = clean(values.partType);
  const systemSlug = clean(request.nextUrl.searchParams.get("system") || "");
  if (!makeSlug || !modelSlug || !partTypeSlug) {
    return NextResponse.json({ error: "Part detail context is invalid." }, { status: 400 });
  }
  const parsedYear = Number.parseInt(request.nextUrl.searchParams.get("year") || "", 10);
  const year = Number.isFinite(parsedYear) && parsedYear >= 1886 && parsedYear <= new Date().getFullYear() + 2 ? parsedYear : null;
  const vehicleId = cleanId(request.nextUrl.searchParams.get("vehicleId"));
  const session = vehicleId ? await auth() : null;
  const result = await getVehiclePartTypeDetail({
    makeSlug,
    modelSlug,
    partTypeSlug,
    systemSlug: systemSlug || null,
    year,
    vehicleId,
    userId: session?.user?.id || null,
  });
  if (!result) return NextResponse.json({ error: "Vehicle part type mapping not found." }, { status: 404 });
  return NextResponse.json(result, {
    headers: { "Cache-Control": vehicleId ? "private, no-store" : "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

function clean(value: string) {
  const cleaned = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,100}$/.test(cleaned) ? cleaned : "";
}

function cleanId(value: string | null) {
  if (!value) return null;
  return /^[a-zA-Z0-9-]{1,100}$/.test(value) ? value : null;
}
