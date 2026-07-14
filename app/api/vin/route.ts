import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { vin } = await request.json();

    if (!vin) {
      return NextResponse.json({ error: "VIN is required" }, { status: 400 });
    }

    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    
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
    console.error("VIN API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
