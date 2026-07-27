/**
 * scripts/report-vin-conflicts.ts
 *
 * VIN Identity Conflict Report
 * Produces a detailed analysis of all vehicles whose VIN-decoded identity
 * conflicts (or might conflict) with their stored make/model/year.
 *
 * Usage:
 *   npm run report-vin-conflicts
 */

import { prisma } from "../lib/prisma";
import { decodeVin } from "../lib/market-crawlers/crawler-engine";
import {
  classifyVinIdentityConflict,
  normalizeModelToMatchName,
  type IdentityConflictClassification,
} from "../lib/data-quality/inventory-validator";
import { isInvalidVin } from "../lib/data-quality/vin-validator";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface ConflictEntry {
  vin: string;
  vehicleId: string;
  dbMake: string;
  dbModel: string;
  dbYear: number;
  sourceMake: string | null;
  sourceModel: string | null;
  sourceName: string | null;
  listingId: string | null;
  decodedMake: string | null;
  decodedModel: string | null;
  decodedYear: number | null;
  classification: IdentityConflictClassification;
  currentInventoryStatus: string | null;
  suggestedInventoryStatus: string;
  notes: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function statusForClassification(c: IdentityConflictClassification): string {
  switch (c) {
    case "VALID":
      return "VALID";
    case "MODEL_NAMING_VARIATION":
    case "TRIM_VARIATION":
      return "WARNING";
    case "TRUE_IDENTITY_CONFLICT":
    case "MAKE_CONFLICT":
    case "YEAR_CONFLICT":
      return "NEEDS_REVIEW";
  }
}

function noteForClassification(c: IdentityConflictClassification): string {
  switch (c) {
    case "VALID":
      return "No conflict detected.";
    case "MODEL_NAMING_VARIATION":
      return "DB model and decoded model resolve to the same base — naming/edition variant only.";
    case "TRIM_VARIATION":
      return "Trim-level difference (e.g. Spider vs Coupe). Base model is consistent.";
    case "TRUE_IDENTITY_CONFLICT":
      return "Decoded model does not match stored model. Manual review recommended.";
    case "MAKE_CONFLICT":
      return "Decoded make does not match stored make. Likely a data ingestion error.";
    case "YEAR_CONFLICT":
      return "Decoded model year differs from stored year. VIN year is authoritative.";
  }
}

function pad(s: string | null | undefined, width: number): string {
  const str = String(s ?? "—");
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

function hr(char = "─", length = 72): string {
  return char.repeat(length);
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + hr("═"));
  console.log("  VIN Identity Conflict Report");
  console.log(hr("═") + "\n");

  const vehicles = await prisma.vehicle.findMany({
    include: {
      model: { include: { make: true } },
      listings: { include: { source: true } },
    },
    where: {
      // Exclude already-merged duplicates (their VINs were renamed)
      NOT: { vin: { contains: "-DUP-" } },
    },
  });

  console.log(`Total vehicles to analyse: ${vehicles.length}`);
  console.log("Decoding VINs against NHTSA…\n");

  const conflicts: ConflictEntry[] = [];
  let skippedInvalid = 0;
  let decodeFailures = 0;
  let clean = 0;

  for (const vehicle of vehicles) {
    const vin = vehicle.vin;

    // Skip structurally invalid VINs (already marked REMOVED)
    if (isInvalidVin(vin)) {
      skippedInvalid++;
      continue;
    }

    const dbMake = vehicle.model.make.name;
    const dbModel = vehicle.model.name;
    const dbYear = vehicle.year;

    // Decode via NHTSA (same path as validation pipeline)
    const decoded = await decodeVin(vin);

    if (!decoded || !decoded.make || !decoded.model || !decoded.year) {
      decodeFailures++;
      continue;
    }

    const decodedMake = String(decoded.make).trim();
    const decodedModel = String(decoded.model).trim();
    const decodedYear = Number(decoded.year);

    // Derive source listing context (first listing wins)
    const primaryListing = vehicle.listings[0] ?? null;
    const sourceMake = dbMake; // listings don't carry a separate make field
    const sourceModel = dbModel; // same — we use DB model as source proxy

    const classification = classifyVinIdentityConflict({
      dbMake,
      dbModel,
      dbYear,
      decodedMake,
      decodedModel,
      decodedYear,
      sourceMake,
      sourceModel,
    });

    if (classification === "VALID") {
      clean++;
      continue;
    }

    conflicts.push({
      vin,
      vehicleId: vehicle.id,
      dbMake,
      dbModel,
      dbYear,
      sourceMake: primaryListing ? sourceMake : null,
      sourceModel: primaryListing ? sourceModel : null,
      sourceName: primaryListing?.source?.name ?? null,
      listingId: primaryListing?.id ?? null,
      decodedMake,
      decodedModel,
      decodedYear,
      classification,
      currentInventoryStatus: vehicle.inventoryStatus ?? null,
      suggestedInventoryStatus: statusForClassification(classification),
      notes: noteForClassification(classification),
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Summary counters
  // ──────────────────────────────────────────────────────────────────────────

  const byClass = new Map<IdentityConflictClassification, ConflictEntry[]>();
  for (const c of conflicts) {
    if (!byClass.has(c.classification)) byClass.set(c.classification, []);
    byClass.get(c.classification)!.push(c);
  }

  console.log(hr());
  console.log("Summary");
  console.log(hr());
  console.log(`  Total vehicles analysed : ${vehicles.length}`);
  console.log(`  Invalid VINs skipped    : ${skippedInvalid}`);
  console.log(`  VIN decode failures     : ${decodeFailures}`);
  console.log(`  Clean (no conflict)     : ${clean}`);
  console.log(`  Conflicts found         : ${conflicts.length}`);
  console.log();
  console.log("  Breakdown by classification:");
  for (const [cls, entries] of byClass.entries()) {
    const suggested = statusForClassification(cls);
    console.log(`    ${pad(cls, 30)} ${pad(String(entries.length), 4)} → ${suggested}`);
  }
  console.log(hr() + "\n");

  // ──────────────────────────────────────────────────────────────────────────
  // Detailed conflict listings
  // ──────────────────────────────────────────────────────────────────────────

  if (conflicts.length === 0) {
    console.log("✅  No VIN identity conflicts detected.");
    return;
  }

  // Group by classification for readability
  const classOrder: IdentityConflictClassification[] = [
    "MAKE_CONFLICT",
    "YEAR_CONFLICT",
    "TRUE_IDENTITY_CONFLICT",
    "TRIM_VARIATION",
    "MODEL_NAMING_VARIATION",
  ];

  for (const cls of classOrder) {
    const entries = byClass.get(cls);
    if (!entries || entries.length === 0) continue;

    console.log(hr("─"));
    console.log(`  Classification: ${cls}  (${entries.length} vehicle${entries.length !== 1 ? "s" : ""})`);
    console.log(`  Suggested status: ${statusForClassification(cls)}`);
    console.log(`  ${noteForClassification(cls)}`);
    console.log(hr("─") + "\n");

    for (const e of entries) {
      console.log(`  VIN          : ${e.vin}`);
      console.log(`  Vehicle ID   : ${e.vehicleId}`);
      console.log();
      console.log(`  Database     : ${e.dbYear} ${e.dbMake} ${e.dbModel}`);
      console.log(`  Source       : ${e.sourceName ?? "—"}  (listing ${e.listingId ?? "—"})`);
      console.log(`  VIN Decoded  : ${e.decodedYear} ${e.decodedMake} ${e.decodedModel}`);
      console.log();
      console.log(`  Current status   : ${e.currentInventoryStatus ?? "—"}`);
      console.log(`  Suggested status : ${e.suggestedInventoryStatus}`);
      console.log(`  Normalised DB    : ${normalizeModelToMatchName(e.dbModel)}`);
      console.log(`  Normalised VIN   : ${normalizeModelToMatchName(e.decodedModel ?? "")}`);
      console.log("\n" + hr("·") + "\n");
    }
  }

  console.log(hr("═"));
  console.log("  Report complete.");
  console.log(hr("═") + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
