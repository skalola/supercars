import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { reportServerError } from "@/lib/observability/error-reporting";
import { getPartsEngineeringRecommendation } from "@/lib/parts/engineering-recommendation-service";
import { getApplicablePartSystems, getPartVehicleSummary } from "@/lib/parts/vehicle-parts-service";

type RouteParams = { params: Promise<{ make: string; model: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { make, model } = await params;
  const makeSlug = clean(make);
  const modelSlug = clean(model);
  if (!makeSlug || !modelSlug) return NextResponse.json({ error: "Vehicle context is invalid." }, { status: 400 });

  const vehicleId = new URL(request.url).searchParams.get("vehicleId")?.trim() || null;
  const session = vehicleId ? await auth() : null;
  const [vehicle, systems, recommendation] = await Promise.all([
    getPartVehicleSummary({ makeSlug, modelSlug }),
    getApplicablePartSystems({ makeSlug, modelSlug }),
    getPartsEngineeringRecommendation({ makeSlug, modelSlug, vehicleId, userId: session?.user?.id || null })
      .catch((error) => {
        reportServerError(error, { route: "parts-vehicle-systems", makeSlug, modelSlug, operation: "engineering-recommendation" });
        return null;
      }),
  ]);
  if (!vehicle) return NextResponse.json({ error: "Vehicle is not available in the parts catalog." }, { status: 404 });

  return NextResponse.json({ vehicle, systems, recommendation }, {
    headers: { "Cache-Control": vehicleId ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

function clean(value: string) {
  const cleaned = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,100}$/.test(cleaned) ? cleaned : "";
}
