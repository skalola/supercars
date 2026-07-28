import { PrismaClient } from "@prisma/client";
import {
  FK_COLUMNS,
  MIGRATION_TABLES,
  MigrationReport,
  TableName,
  assertSqliteSourceExists,
  neonCount,
  normalizeValue,
  readSqliteCount,
  readSqliteRows,
  sqliteDatabasePath,
  writeReport,
} from "./neon-migration/common";

type Row = Record<string, unknown>;

type ConflictResolver = {
  columns: string[];
  ready: (row: Row) => boolean;
};

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");
const dryRun = !execute;

const OPTIONAL_FKS = new Set([
  "Vehicle.ownerId",
  "MaintenanceRule.modelId",
  "Listing.sourceId",
  "Listing.vehicleId",
  "Listing.sellerId",
  "VinDiscovery.vehicleId",
  "VinDiscoverySource.sourceId",
  "PartnerContact.marketSourceId",
  "FulfillmentRequest.buyerId",
  "FulfillmentRequest.vehicleId",
  "FulfillmentRequest.listingId",
  "FulfillmentRequest.purchaseId",
  "FulfillmentParty.partnerContactId",
]);

const IDENTITY: Partial<Record<TableName, ConflictResolver[]>> = {
  Make: [{ columns: ["slug"], ready: (r) => Boolean(r.slug) }],
  User: [
    { columns: ["email"], ready: (r) => Boolean(r.email) },
    { columns: ["id"], ready: (r) => Boolean(r.id) },
  ],
  MarketSource: [{ columns: ["name"], ready: (r) => Boolean(r.name) }],
  Model: [{ columns: ["makeId", "slug"], ready: (r) => Boolean(r.makeId && r.slug) }],
  ModelSpec: [{ columns: ["modelId"], ready: (r) => Boolean(r.modelId) }],
  ModelVariant: [{ columns: ["modelId", "slug"], ready: (r) => Boolean(r.modelId && r.slug) }],
  ModelImage: [{ columns: ["modelId", "url"], ready: (r) => Boolean(r.modelId && r.url) }],
  Account: [{ columns: ["provider", "providerAccountId"], ready: (r) => Boolean(r.provider && r.providerAccountId) }],
  Session: [{ columns: ["sessionToken"], ready: (r) => Boolean(r.sessionToken) }],
  GarageItem: [{ columns: ["userId", "modelId"], ready: (r) => Boolean(r.userId && r.modelId) }],
  Vehicle: [{ columns: ["vin"], ready: (r) => Boolean(r.vin) }],
  VehicleProfile: [{ columns: ["vehicleId"], ready: (r) => Boolean(r.vehicleId) }],
  Listing: [
    { columns: ["sourceId", "externalListingId"], ready: (r) => Boolean(r.sourceId && r.externalListingId) },
    { columns: ["id"], ready: (r) => Boolean(r.id) },
  ],
  VinDiscovery: [{ columns: ["vin"], ready: (r) => Boolean(r.vin) }],
  VinDiscoverySource: [{ columns: ["discoveryId", "sourceKey"], ready: (r) => Boolean(r.discoveryId && r.sourceKey) }],
  InsuranceRequest: [{ columns: ["purchaseId"], ready: (r) => Boolean(r.purchaseId) }],
  DeliveryRequest: [{ columns: ["purchaseId"], ready: (r) => Boolean(r.purchaseId) }],
  FulfillmentRequest: [{ columns: ["publicTransactionToken"], ready: (r) => Boolean(r.publicTransactionToken) }],
  PartnerDecisionToken: [{ columns: ["token"], ready: (r) => Boolean(r.token) }],
  PartnerContact: [
    { columns: ["marketSourceId"], ready: (r) => Boolean(r.marketSourceId) },
    { columns: ["id"], ready: (r) => Boolean(r.id) },
  ],
};

function defaultResolvers(): ConflictResolver[] {
  return [{ columns: ["id"], ready: (r) => Boolean(r.id) }];
}

function conflictFor(table: TableName, row: Row): ConflictResolver | null {
  for (const resolver of IDENTITY[table] || defaultResolvers()) {
    if (resolver.ready(row)) return resolver;
  }
  return row.id ? { columns: ["id"], ready: () => true } : null;
}

function quote(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function mapForeignKeys(table: TableName, row: Row, idMaps: Map<TableName, Map<string, string>>) {
  const fkConfig = FK_COLUMNS[table] || {};
  for (const [column, targetTable] of Object.entries(fkConfig)) {
    const value = row[column];
    if (typeof value !== "string" || !value) continue;
    const mapped = idMaps.get(targetTable)?.get(value);
    if (mapped) row[column] = mapped;
  }
}

function requiredForeignKeysPresent(table: TableName, row: Row, idMaps: Map<TableName, Map<string, string>>) {
  const required = Object.entries(FK_COLUMNS[table] || {}).filter(([column]) => {
    return !OPTIONAL_FKS.has(`${table}.${column}`);
  });
  for (const [column, targetTable] of required) {
    const value = row[column];
    const mappedValues = idMaps.get(targetTable);
    if (
      typeof value === "string" &&
      value &&
      !mappedValues?.has(value) &&
      ![...(mappedValues?.values() || [])].includes(value)
    ) {
      return `${column} references missing ${targetTable}:${value}`;
    }
  }
  return null;
}

async function existingId(table: TableName, conflict: ConflictResolver, row: Row) {
  const where = conflict.columns.map((column, index) => `${quote(column)} = $${index + 1}`).join(" AND ");
  const values = conflict.columns.map((column) => row[column]);
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM ${quote(table)} WHERE ${where} LIMIT 1`,
    ...values,
  );
  return rows[0]?.id || null;
}

async function upsertRow(table: TableName, row: Row, conflict: ConflictResolver) {
  const columns = Object.keys(row).filter((column) => row[column] !== undefined);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const updateColumns = columns.filter((column) => !conflict.columns.includes(column) && column !== "id");
  const updateSql = updateColumns.length
    ? `DO UPDATE SET ${updateColumns.map((column) => `${quote(column)} = EXCLUDED.${quote(column)}`).join(", ")}`
    : "DO NOTHING";
  const sql = [
    `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")})`,
    `VALUES (${placeholders.join(", ")})`,
    `ON CONFLICT (${conflict.columns.map(quote).join(", ")}) ${updateSql}`,
    `RETURNING "id"`,
  ].join(" ");

  const before = await existingId(table, conflict, row);
  const result = await prisma.$queryRawUnsafe<Array<{ id: string }>>(sql, ...columns.map((column) => row[column]));
  return {
    id: result[0]?.id || before || String(row.id || ""),
    action: before ? "updated" : "inserted",
  };
}

async function validateDiagnostics(dbPath: string) {
  const vehicles = readSqliteRows<Row>(dbPath, "Vehicle");
  const vins = vehicles.map((row) => String(row.vin || "").trim().toUpperCase()).filter(Boolean);
  const duplicateVins = [...new Set(vins.filter((vin, index) => vins.indexOf(vin) !== index))];
  const missingVehicleRequired = vehicles
    .filter((row) => !row.vin || !row.modelId || !row.year)
    .map((row) => row.id);

  return {
    duplicateVins,
    missingVehicleRequired,
    sourceVehicleCount: vehicles.length,
    sourceVinCount: vins.length,
  };
}

async function migrate() {
  const dbPath = sqliteDatabasePath();
  assertSqliteSourceExists(dbPath);

  const report: MigrationReport = {
    mode: dryRun ? "dry-run" : "execute",
    sqliteDatabasePath: dbPath,
    startedAt: new Date().toISOString(),
    tables: {},
    diagnostics: await validateDiagnostics(dbPath),
  };

  const idMaps = new Map<TableName, Map<string, string>>();

  for (const table of MIGRATION_TABLES) {
    idMaps.set(table, new Map());
    const sqliteCount = readSqliteCount(dbPath, table);
    const neonBefore = await neonCount(prisma, table);
    const tableReport = {
      sqliteCount,
      neonBefore,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      neonAfter: neonBefore,
      failures: [] as Array<{ id?: string; reason: string }>,
    };
    report.tables[table] = tableReport;

    const rows = readSqliteRows<Row>(dbPath, table);
    for (const sourceRow of rows) {
      const oldId = typeof sourceRow.id === "string" ? sourceRow.id : undefined;
      const row: Row = {};
      for (const [column, value] of Object.entries(sourceRow)) {
        row[column] = normalizeValue(table, column, value);
      }
      mapForeignKeys(table, row, idMaps);

      const missingFk = requiredForeignKeysPresent(table, row, idMaps);
      const conflict = conflictFor(table, row);
      if (missingFk || !conflict) {
        tableReport.skipped += 1;
        tableReport.failures.push({ id: oldId, reason: missingFk || "No stable identity/conflict key available." });
        continue;
      }

      try {
        if (dryRun) {
          const id = await existingId(table, conflict, row);
          if (id) {
            tableReport.updated += 1;
            if (oldId) idMaps.get(table)?.set(oldId, id);
          } else {
            tableReport.inserted += 1;
            if (oldId) idMaps.get(table)?.set(oldId, oldId);
          }
        } else {
          const result = await upsertRow(table, row, conflict);
          if (result.action === "inserted") tableReport.inserted += 1;
          else tableReport.updated += 1;
          if (oldId && result.id) idMaps.get(table)?.set(oldId, result.id);
        }
      } catch (error) {
        tableReport.failed += 1;
        tableReport.failures.push({
          id: oldId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    tableReport.neonAfter = dryRun ? neonBefore : await neonCount(prisma, table);
    console.log(
      `${table.padEnd(22)} source=${sqliteCount} before=${neonBefore ?? "missing"} ` +
      `insert=${tableReport.inserted} update=${tableReport.updated} skip=${tableReport.skipped} fail=${tableReport.failed} after=${tableReport.neonAfter ?? "missing"}`,
    );
  }

  report.finishedAt = new Date().toISOString();
  const file = writeReport(report, `neon-migration-${report.mode}-${Date.now()}.json`);
  console.log(`\nMigration report written to ${file}`);
  if (dryRun) {
    console.log("Dry run only. No Neon writes were performed. Run npm run migrate:neon to execute.");
  }
}

migrate()
  .catch((error) => {
    console.error("[migrate-sqlite-to-neon] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
