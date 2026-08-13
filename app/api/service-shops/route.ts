import { auth } from "@/auth";
import { findNearbyServiceShops, isValidCoordinate, SERVICE_RADIUS_MILES } from "@/lib/location/nearby-service-shops";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  if (!isValidCoordinate(latitude, longitude)) {
    return Response.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
  }

  const shops = await findNearbyServiceShops(latitude, longitude);

  return Response.json({
    shops,
    radiusMiles: SERVICE_RADIUS_MILES,
  });
}
