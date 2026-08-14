import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ServiceRecordSummaryRow = {
  vehicleId: string;
  serviceKey: string;
  lastMileage: number;
};

export async function getClaimedVehicleServiceRecordSummaries(userId: string) {
  return prisma.$queryRaw<ServiceRecordSummaryRow[]>(Prisma.sql`
    SELECT
      record."vehicleId" AS "vehicleId",
      substring(record."description" FROM '^\\[[^]]+\\]') AS "serviceKey",
      COALESCE(MAX(record."mileage"), 0)::int AS "lastMileage"
    FROM "ServiceRecord" record
    INNER JOIN "Vehicle" vehicle ON vehicle."id" = record."vehicleId"
    WHERE vehicle."ownerId" = ${userId}
      AND vehicle."status" = 'CLAIMED'
      AND record."description" ~ '^\\[[^]]+\\]'
    GROUP BY record."vehicleId", "serviceKey"
  `);
}

export function groupServiceRecordsByVehicle(rows: ServiceRecordSummaryRow[]) {
  const grouped = new Map<string, Array<{ mileage: number; description: string }>>();

  for (const row of rows) {
    const records = grouped.get(row.vehicleId) ?? [];
    records.push({ mileage: row.lastMileage, description: row.serviceKey });
    grouped.set(row.vehicleId, records);
  }

  return grouped;
}
