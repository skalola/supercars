import { PrismaClient } from "@prisma/client";
import {
  MIGRATION_TABLES,
  neonCount,
  readSqliteCount,
  readSqliteRows,
  sqliteDatabasePath,
  writeReport,
} from "./neon-migration/common";

const prisma = new PrismaClient();

async function main() {
  const dbPath = sqliteDatabasePath();
  const tables: Record<string, { sqliteCount: number; neonCount: number | null; delta: number | null }> = {};

  for (const table of MIGRATION_TABLES) {
    const sqliteCount = readSqliteCount(dbPath, table);
    const targetCount = await neonCount(prisma, table);
    tables[table] = {
      sqliteCount,
      neonCount: targetCount,
      delta: targetCount === null ? null : targetCount - sqliteCount,
    };
  }

  const duplicateVinRows = await prisma.$queryRawUnsafe<Array<{ vin: string; count: bigint }>>(
    `SELECT UPPER(TRIM("vin")) AS vin, COUNT(*)::bigint AS count
     FROM "Vehicle"
     WHERE "vin" IS NOT NULL AND TRIM("vin") <> ''
     GROUP BY UPPER(TRIM("vin"))
     HAVING COUNT(*) > 1`,
  ).catch(() => []);

  const sourceVehicles = readSqliteRows<Record<string, unknown>>(dbPath, "Vehicle");
  const sourceVinCount = sourceVehicles.filter((row) => String(row.vin || "").trim()).length;

  const [ferrari, lamborghini, vehicleCount, modelCount, vehicleImageCount, listingVehicleCount] = await Promise.all([
    prisma.make.findUnique({ where: { slug: "ferrari" } }),
    prisma.make.findUnique({ where: { slug: "lamborghini" } }),
    prisma.vehicle.count(),
    prisma.model.count(),
    prisma.vehicleImage.count(),
    prisma.listing.count({ where: { vehicleId: { not: null } } }),
  ]);

  const representativeVehicles = await prisma.vehicle.findMany({
    take: 5,
    orderBy: { updatedAt: "desc" },
    include: { model: { include: { make: true } }, images: true, listings: true },
  });

  const diagnostics = {
    ferrariExists: Boolean(ferrari),
    lamborghiniExists: Boolean(lamborghini),
    sourceVinCount,
    vehicleCount,
    modelCount,
    vehicleCountGreaterThanModelCount: vehicleCount > modelCount,
    duplicateVins: duplicateVinRows.map((row) => ({ vin: row.vin, count: Number(row.count) })),
    vehicleImageCount,
    listingVehicleCount,
    representativeVehicles: representativeVehicles.map((vehicle) => ({
      vin: vehicle.vin,
      make: vehicle.model.make.name,
      model: vehicle.model.name,
      imageCount: vehicle.images.length,
      listingCount: vehicle.listings.length,
    })),
  };

  const report = {
    mode: "verify",
    sqliteDatabasePath: dbPath,
    generatedAt: new Date().toISOString(),
    tables,
    diagnostics,
  };

  const file = writeReport(report, `neon-verify-${Date.now()}.json`);
  console.table(tables);
  console.log("\nDiagnostics:");
  console.log(JSON.stringify(diagnostics, null, 2));
  console.log(`\nVerification report written to ${file}`);
}

main()
  .catch((error) => {
    console.error("[verify-neon-migration] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
