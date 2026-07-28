import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

export type TableName =
  | "Make" | "User" | "MarketSource"
  | "Model" | "ModelSpec" | "ModelVariant" | "ModelImage"
  | "Account" | "Session" | "GarageItem"
  | "Vehicle" | "VehicleImage" | "VehicleProfile" | "VehicleModification" | "ServiceRecord" | "VehicleAward" | "VehiclePhoto" | "VehicleDocument"
  | "MaintenanceRule" | "Listing" | "VinDiscovery" | "VinDiscoverySource" | "MarketSale" | "MarketSnapshot"
  | "Purchase" | "InsuranceRequest" | "DeliveryRequest"
  | "PartnerContact" | "FulfillmentRequest" | "FulfillmentParty" | "FulfillmentPackage" | "FulfillmentEvent" | "FulfillmentFee" | "DepositIntent" | "PartnerDecisionToken";

export const MIGRATION_TABLES: TableName[] = [
  "Make", "User", "MarketSource",
  "Model", "ModelSpec", "ModelVariant", "ModelImage",
  "Account", "Session", "GarageItem",
  "Vehicle", "VehicleImage", "VehicleProfile", "VehicleModification", "ServiceRecord", "VehicleAward", "VehiclePhoto", "VehicleDocument",
  "MaintenanceRule", "Listing", "VinDiscovery", "VinDiscoverySource", "MarketSale", "MarketSnapshot",
  "Purchase", "InsuranceRequest", "DeliveryRequest",
  "PartnerContact", "FulfillmentRequest", "FulfillmentParty", "FulfillmentPackage", "FulfillmentEvent", "FulfillmentFee", "DepositIntent", "PartnerDecisionToken",
];

export const FK_COLUMNS: Partial<Record<TableName, Record<string, TableName>>> = {
  Model: { makeId: "Make" },
  ModelSpec: { modelId: "Model" },
  ModelVariant: { modelId: "Model" },
  ModelImage: { modelId: "Model" },
  Account: { userId: "User" },
  Session: { userId: "User" },
  GarageItem: { userId: "User", modelId: "Model" },
  Vehicle: { modelId: "Model", ownerId: "User" },
  VehicleImage: { vehicleId: "Vehicle" },
  VehicleProfile: { vehicleId: "Vehicle" },
  VehicleModification: { vehicleId: "Vehicle" },
  ServiceRecord: { vehicleId: "Vehicle" },
  VehicleAward: { vehicleId: "Vehicle" },
  VehiclePhoto: { vehicleId: "Vehicle" },
  VehicleDocument: { vehicleId: "Vehicle" },
  MaintenanceRule: { modelId: "Model" },
  Listing: { modelId: "Model", sourceId: "MarketSource", vehicleId: "Vehicle", sellerId: "User" },
  VinDiscovery: { vehicleId: "Vehicle" },
  VinDiscoverySource: { discoveryId: "VinDiscovery", sourceId: "MarketSource" },
  MarketSale: { modelId: "Model", sourceId: "MarketSource" },
  MarketSnapshot: { modelId: "Model" },
  Purchase: { listingId: "Listing", buyerId: "User" },
  InsuranceRequest: { purchaseId: "Purchase", userId: "User", vehicleId: "Vehicle" },
  DeliveryRequest: { purchaseId: "Purchase", userId: "User", vehicleId: "Vehicle" },
  PartnerContact: { marketSourceId: "MarketSource" },
  FulfillmentRequest: { buyerId: "User", vehicleId: "Vehicle", listingId: "Listing", purchaseId: "Purchase" },
  FulfillmentParty: { fulfillmentRequestId: "FulfillmentRequest", partnerContactId: "PartnerContact" },
  FulfillmentPackage: { fulfillmentRequestId: "FulfillmentRequest" },
  FulfillmentEvent: { fulfillmentRequestId: "FulfillmentRequest" },
  FulfillmentFee: { fulfillmentRequestId: "FulfillmentRequest" },
  DepositIntent: { fulfillmentRequestId: "FulfillmentRequest" },
  PartnerDecisionToken: { fulfillmentRequestId: "FulfillmentRequest" },
};

export const BOOLEAN_COLUMNS = new Set([
  "VehicleImage.isPrimary",
  "MarketSource.active",
  "Listing.vinVerified",
  "VinDiscovery.active",
  "VinDiscoverySource.active",
  "VehiclePhoto.isHero",
  "PartnerContact.active",
]);

export const INTEGER_BOOLEAN_COLUMNS = new Set([
  "VehicleImage.isPrimary",
  "MarketSource.active",
  "Listing.vinVerified",
  "VinDiscovery.active",
  "VinDiscoverySource.active",
  "VehiclePhoto.isHero",
  "PartnerContact.active",
]);

export const DATE_COLUMNS = new Set([
  "emailVerified",
  "createdAt",
  "updatedAt",
  "serviceDate",
  "awardDate",
  "firstSeen",
  "lastSeen",
  "firstDiscovered",
  "saleDate",
  "date",
  "partnerAcceptedAt",
  "completedAt",
  "expiresAt",
  "expires",
  "capturedAt",
  "releasedAt",
  "viewedAt",
  "actionTakenAt",
  "lastVerifiedAt",
]);

export type TableReport = {
  sqliteCount: number;
  neonBefore: number | null;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  neonAfter: number | null;
  failures: Array<{ id?: string; reason: string }>;
};

export type MigrationReport = {
  mode: "dry-run" | "execute";
  sqliteDatabasePath: string;
  startedAt: string;
  finishedAt?: string;
  tables: Record<string, TableReport>;
  diagnostics: Record<string, unknown>;
};

export function sqliteDatabasePath() {
  const url = process.env.SQLITE_DATABASE_URL || "file:./prisma/dev.db";
  if (!url.startsWith("file:")) {
    throw new Error("SQLITE_DATABASE_URL must use a file: URL, for example file:./prisma/dev.db");
  }
  return path.resolve(process.cwd(), url.slice("file:".length));
}

export function assertSqliteSourceExists(dbPath: string) {
  if (!fs.existsSync(dbPath)) throw new Error(`SQLite source database not found: ${dbPath}`);
  const stat = fs.statSync(dbPath);
  if (stat.size === 0) throw new Error(`SQLite source database is empty: ${dbPath}`);
}

export function readSqliteRows<T extends Record<string, unknown>>(dbPath: string, table: string): T[] {
  const sql = `SELECT * FROM "${table}"`;
  const output = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  }).trim();
  return output ? JSON.parse(output) as T[] : [];
}

export function readSqliteCount(dbPath: string, table: string): number {
  return Number(execFileSync("sqlite3", [dbPath, `SELECT COUNT(*) FROM "${table}";`], { encoding: "utf8" }).trim());
}

export function normalizeBlank(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

export function normalizeVin(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.trim().toUpperCase();
}

export function normalizeValue(table: string, column: string, value: unknown): unknown {
  const normalized = column === "vin" ? normalizeVin(value) : normalizeBlank(value);
  if (normalized === null || normalized === undefined) return null;
  if (DATE_COLUMNS.has(column)) {
    if (typeof normalized === "number") return new Date(normalized);
    if (typeof normalized === "string") {
      const numeric = Number(normalized);
      const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(normalized);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  if (BOOLEAN_COLUMNS.has(`${table}.${column}`)) {
    if (typeof normalized === "boolean") return normalized;
    if (INTEGER_BOOLEAN_COLUMNS.has(`${table}.${column}`)) return Number(normalized) === 1;
  }
  return normalized;
}

export async function tableExists(prisma: PrismaClient, table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT to_regclass('public."${table}"') IS NOT NULL AS "exists"`,
  );
  return Boolean(rows[0]?.exists);
}

export async function neonCount(prisma: PrismaClient, table: string): Promise<number | null> {
  if (!(await tableExists(prisma, table))) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
  return Number(rows[0]?.count ?? 0);
}

export function writeReport(report: unknown, filename: string) {
  const outDir = path.resolve(process.cwd(), "migration-reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, filename);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return outputPath;
}
