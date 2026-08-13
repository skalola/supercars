import { Prisma } from "@prisma/client";
import type { DirectoryVendorType } from "@/app/directory/DirectoryTabs";
import { prisma } from "@/lib/prisma";

export const ADMIN_DIRECTORY_PAGE_SIZE = 50;
const DIRECTORY_RADIUS_MILES = 100;

export type AdminDirectoryFilters = {
  type: DirectoryVendorType;
  make?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
};

type DirectoryRow = {
  id: string;
  name: string;
  type: string;
  location: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  makeSpecialization: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMiles: number | null;
  totalCount: number;
};

type DirectoryCountRow = { type: string; count: number };

export async function getAdminDirectoryPage(filters: AdminDirectoryFilters, page: number) {
  const latitude = filters.latitude;
  const longitude = filters.longitude;
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  const makeFilter = filters.make && filters.make !== "ALL" ? filters.make : null;
  const locationFilter = filters.location?.trim() || null;
  const offset = (page - 1) * ADMIN_DIRECTORY_PAGE_SIZE;

  const makeClause = makeFilter
    ? Prisma.sql`AND (contact."makeSpecialization" = 'ALL' OR contact."makeSpecialization" = ${makeFilter})`
    : Prisma.empty;
  const locationClause = locationFilter && !hasCoordinates
    ? Prisma.sql`AND (
        contact."name" ILIKE ${`%${locationFilter}%`}
        OR contact."location" ILIKE ${`%${locationFilter}%`}
        OR contact."city" ILIKE ${`%${locationFilter}%`}
        OR contact."state" ILIKE ${`%${locationFilter}%`}
        OR contact."postalCode" ILIKE ${`%${locationFilter}%`}
      )`
    : Prisma.empty;

  if (hasCoordinates) {
    const lat = latitude as number;
    const lon = longitude as number;
    const latitudeDelta = DIRECTORY_RADIUS_MILES / 69;
    const longitudeMilesPerDegree = Math.max(69.172 * Math.cos((lat * Math.PI) / 180), 1);
    const longitudeDelta = DIRECTORY_RADIUS_MILES / longitudeMilesPerDegree;
    const rows = await prisma.$queryRaw<DirectoryRow[]>(Prisma.sql`
      WITH nearby AS (
        SELECT contact.*,
          3958.8 * 2 * ASIN(LEAST(1, SQRT(
            POWER(SIN(RADIANS(contact."latitude" - ${lat}) / 2), 2) +
            COS(RADIANS(${lat})) * COS(RADIANS(contact."latitude")) *
            POWER(SIN(RADIANS(contact."longitude" - ${lon}) / 2), 2)
          ))) AS distance_miles
        FROM "PartnerContact" contact
        WHERE contact."active" = TRUE
          AND contact."website" IS NOT NULL
          AND contact."city" IS NOT NULL
          AND contact."state" IS NOT NULL
          AND contact."latitude" BETWEEN ${lat - latitudeDelta} AND ${lat + latitudeDelta}
          AND contact."longitude" BETWEEN ${lon - longitudeDelta} AND ${lon + longitudeDelta}
          ${makeClause}
      ), filtered AS (
        SELECT * FROM nearby WHERE distance_miles <= ${DIRECTORY_RADIUS_MILES}
      ), deduped AS (
        SELECT *
        FROM (
          SELECT filtered.*,
            ROW_NUMBER() OVER (
              PARTITION BY
                filtered."type",
                regexp_replace(lower(filtered."name"), '[^a-z0-9@.]', '', 'g'),
                regexp_replace(lower(COALESCE(filtered."email", '')), '[^a-z0-9@.]', '', 'g'),
                regexp_replace(lower(COALESCE(filtered."phone", '')), '[^a-z0-9@.]', '', 'g'),
                regexp_replace(lower(COALESCE(concat_ws(', ', filtered."city", filtered."state"), filtered."location", '')), '[^a-z0-9@.]', '', 'g')
              ORDER BY filtered.distance_miles ASC, filtered."updatedAt" DESC
            ) AS duplicate_rank
          FROM filtered
        ) ranked
        WHERE ranked.duplicate_rank = 1
      )
      SELECT
        filtered."id", filtered."name", filtered."type", filtered."location",
        filtered."city", filtered."state", filtered."postalCode", filtered."phone",
        filtered."email", filtered."website", filtered."makeSpecialization",
        filtered."latitude", filtered."longitude",
        filtered.distance_miles AS "distanceMiles",
        COUNT(*) OVER()::int AS "totalCount"
      FROM deduped filtered
      WHERE filtered."type" = ${filters.type}
      ORDER BY filtered.distance_miles ASC, filtered."name" ASC
      LIMIT ${ADMIN_DIRECTORY_PAGE_SIZE} OFFSET ${offset}
    `);
    const counts = await prisma.$queryRaw<DirectoryCountRow[]>(Prisma.sql`
      WITH nearby AS (
        SELECT contact.*,
          3958.8 * 2 * ASIN(LEAST(1, SQRT(
            POWER(SIN(RADIANS(contact."latitude" - ${lat}) / 2), 2) +
            COS(RADIANS(${lat})) * COS(RADIANS(contact."latitude")) *
            POWER(SIN(RADIANS(contact."longitude" - ${lon}) / 2), 2)
          ))) AS distance_miles
        FROM "PartnerContact" contact
        WHERE contact."active" = TRUE
          AND contact."website" IS NOT NULL
          AND contact."city" IS NOT NULL
          AND contact."state" IS NOT NULL
          AND contact."latitude" BETWEEN ${lat - latitudeDelta} AND ${lat + latitudeDelta}
          AND contact."longitude" BETWEEN ${lon - longitudeDelta} AND ${lon + longitudeDelta}
          ${makeClause}
      ), filtered AS (
        SELECT * FROM nearby WHERE distance_miles <= ${DIRECTORY_RADIUS_MILES}
      ), deduped AS (
        SELECT *
        FROM (
          SELECT filtered.*,
            ROW_NUMBER() OVER (
              PARTITION BY
                filtered."type",
                regexp_replace(lower(filtered."name"), '[^a-z0-9@.]', '', 'g'),
                regexp_replace(lower(COALESCE(filtered."email", '')), '[^a-z0-9@.]', '', 'g'),
                regexp_replace(lower(COALESCE(filtered."phone", '')), '[^a-z0-9@.]', '', 'g'),
                regexp_replace(lower(COALESCE(concat_ws(', ', filtered."city", filtered."state"), filtered."location", '')), '[^a-z0-9@.]', '', 'g')
              ORDER BY filtered.distance_miles ASC, filtered."updatedAt" DESC
            ) AS duplicate_rank
          FROM filtered
        ) ranked
        WHERE ranked.duplicate_rank = 1
      )
      SELECT deduped."type", COUNT(*)::int AS count
      FROM deduped
      GROUP BY deduped."type"
    `);
    return { rows, totalCount: rows[0]?.totalCount ?? 0, counts: toCountRecord(counts) };
  }

  const rows = await prisma.$queryRaw<DirectoryRow[]>(Prisma.sql`
    WITH filtered AS (
      SELECT contact.*
      FROM "PartnerContact" contact
      WHERE contact."active" = TRUE
        AND contact."website" IS NOT NULL
        AND contact."city" IS NOT NULL
        AND contact."state" IS NOT NULL
        ${makeClause}
        ${locationClause}
    ), deduped AS (
      SELECT *
      FROM (
        SELECT filtered.*,
          ROW_NUMBER() OVER (
            PARTITION BY
              filtered."type",
              regexp_replace(lower(filtered."name"), '[^a-z0-9@.]', '', 'g'),
              regexp_replace(lower(COALESCE(filtered."email", '')), '[^a-z0-9@.]', '', 'g'),
              regexp_replace(lower(COALESCE(filtered."phone", '')), '[^a-z0-9@.]', '', 'g'),
              regexp_replace(lower(COALESCE(concat_ws(', ', filtered."city", filtered."state"), filtered."location", '')), '[^a-z0-9@.]', '', 'g')
            ORDER BY filtered."updatedAt" DESC
          ) AS duplicate_rank
        FROM filtered
      ) ranked
      WHERE ranked.duplicate_rank = 1
    )
    SELECT
      filtered."id", filtered."name", filtered."type", filtered."location",
      filtered."city", filtered."state", filtered."postalCode", filtered."phone",
      filtered."email", filtered."website", filtered."makeSpecialization",
      filtered."latitude", filtered."longitude", NULL::double precision AS "distanceMiles",
      COUNT(*) OVER()::int AS "totalCount"
    FROM deduped filtered
    WHERE filtered."type" = ${filters.type}
    ORDER BY filtered."name" ASC
    LIMIT ${ADMIN_DIRECTORY_PAGE_SIZE} OFFSET ${offset}
  `);
  const counts = await prisma.$queryRaw<DirectoryCountRow[]>(Prisma.sql`
    WITH filtered AS (
      SELECT contact.*
      FROM "PartnerContact" contact
      WHERE contact."active" = TRUE
        AND contact."website" IS NOT NULL
        AND contact."city" IS NOT NULL
        AND contact."state" IS NOT NULL
        ${makeClause}
        ${locationClause}
    ), deduped AS (
      SELECT *
      FROM (
        SELECT filtered.*,
          ROW_NUMBER() OVER (
            PARTITION BY
              filtered."type",
              regexp_replace(lower(filtered."name"), '[^a-z0-9@.]', '', 'g'),
              regexp_replace(lower(COALESCE(filtered."email", '')), '[^a-z0-9@.]', '', 'g'),
              regexp_replace(lower(COALESCE(filtered."phone", '')), '[^a-z0-9@.]', '', 'g'),
              regexp_replace(lower(COALESCE(concat_ws(', ', filtered."city", filtered."state"), filtered."location", '')), '[^a-z0-9@.]', '', 'g')
            ORDER BY filtered."updatedAt" DESC
          ) AS duplicate_rank
        FROM filtered
      ) ranked
      WHERE ranked.duplicate_rank = 1
    )
    SELECT deduped."type", COUNT(*)::int AS count
    FROM deduped
    GROUP BY deduped."type"
  `);

  return { rows, totalCount: rows[0]?.totalCount ?? 0, counts: toCountRecord(counts) };
}

function toCountRecord(rows: DirectoryCountRow[]) {
  const counts: Record<DirectoryVendorType, number> = {
    DEALER: 0,
    SERVICE_SHOP: 0,
    TRANSPORTER: 0,
    INSURER: 0,
  };
  for (const row of rows) {
    if (row.type in counts) counts[row.type as DirectoryVendorType] = row.count;
  }
  return counts;
}
