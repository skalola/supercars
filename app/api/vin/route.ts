import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { enforceActionRateLimit, isActionRateLimitError } from "@/lib/security/action-rate-limit";
import { vinClaimSchema } from "@/lib/validation/transaction-inputs";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const parsedVin = vinClaimSchema.safeParse(body?.vin);

    if (!parsedVin.success) {
      return NextResponse.json({ error: "Enter a valid 17-character VIN." }, { status: 400 });
    }
    const vin = parsedVin.data;
    await enforceActionRateLimit({
      actorId: session.user.id,
      action: "vin_decode",
      bucketKey: vin,
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });

    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
    
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch VIN data" }, { status: response.status });
    }

    const data = await response.json();
    const results = data.Results?.[0];

    if (!results) {
      return NextResponse.json({ valid: false, error: "VIN not found" }, { status: 404 });
    }

    // Return the full results object so the client/action can decide what to save
    return NextResponse.json({
      valid: true,
      ...results,
    });
  } catch (error) {
    if (isActionRateLimitError(error)) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("VIN API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
