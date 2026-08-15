import { NextResponse } from "next/server";
import { getApplicablePartTypes } from "@/lib/parts/vehicle-parts-service";

type RouteParams = { params: Promise<{ make: string; model: string; system: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const values = await params;
  const makeSlug = clean(values.make);
  const modelSlug = clean(values.model);
  const systemSlug = clean(values.system);
  if (!makeSlug || !modelSlug || !systemSlug) return NextResponse.json({ error: "Parts context is invalid." }, { status: 400 });

  const partTypes = await getApplicablePartTypes({ makeSlug, modelSlug, systemSlug });
  return NextResponse.json({ vehicle: { makeSlug, modelSlug }, systemSlug, partTypes }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}

function clean(value: string) {
  const cleaned = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,100}$/.test(cleaned) ? cleaned : "";
}
