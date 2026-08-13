import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SERVICE_RADIUS_MILES = 100;
const SERVICE_SHOP_LIMIT = 30;

type NearbyServiceShopRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  distanceMiles: number;
};

export async function findNearbyServiceShops(latitude: number, longitude: number) {
  if (!isValidCoordinate(latitude, longitude)) return [];

  const latitudeDelta = SERVICE_RADIUS_MILES / 69;
  const longitudeMilesPerDegree = Math.max(69.172 * Math.cos((latitude * Math.PI) / 180), 1);
  const longitudeDelta = SERVICE_RADIUS_MILES / longitudeMilesPerDegree;

  return prisma.$queryRaw<NearbyServiceShopRow[]>(Prisma.sql`
    SELECT nearby."id",
           nearby."name",
           nearby."city",
           nearby."state",
           nearby."latitude",
           nearby."longitude",
           nearby."distanceMiles"
    FROM (
      SELECT contact."id",
             contact."name",
             contact."city",
             contact."state",
             contact."latitude",
             contact."longitude",
             3958.8 * 2 * ASIN(
               LEAST(1, SQRT(
                 POWER(SIN(RADIANS(contact."latitude" - ${latitude}) / 2), 2) +
                 COS(RADIANS(${latitude})) * COS(RADIANS(contact."latitude")) *
                 POWER(SIN(RADIANS(contact."longitude" - ${longitude}) / 2), 2)
               ))
             ) AS "distanceMiles"
      FROM "PartnerContact" contact
      WHERE contact."type" = 'SERVICE_SHOP'
        AND contact."active" = TRUE
        AND contact."email" IS NOT NULL
        AND BTRIM(contact."email") <> ''
        AND contact."latitude" BETWEEN ${latitude - latitudeDelta} AND ${latitude + latitudeDelta}
        AND contact."longitude" BETWEEN ${longitude - longitudeDelta} AND ${longitude + longitudeDelta}
    ) nearby
    WHERE nearby."distanceMiles" <= ${SERVICE_RADIUS_MILES}
    ORDER BY nearby."distanceMiles" ASC, nearby."name" ASC
    LIMIT ${SERVICE_SHOP_LIMIT}
  `);
}

export function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}
