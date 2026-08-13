import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

type PgStatRow = {
  query_id: bigint | number | string;
  query: string;
  calls: bigint | number;
  total_rows: bigint | number;
  avg_rows_per_call: number | null;
  total_exec_time_ms?: number | null;
};

type TableSizeRow = {
  table_name: string;
  estimated_live_rows: bigint | number;
  average_table_row_bytes: bigint | number;
  total_size: string;
  table_size: string;
  index_size: string;
};

type PgStatInfoRow = {
  stats_reset: Date | string | null;
};

const RISK_AREAS = [
  {
    area: "Make / Model Catalog Growth",
    files: ["lib/makes/catalog.ts"],
    risk: "The shared selector intentionally hydrates the full make/model taxonomy once per cache window; its payload grows with catalog breadth.",
    next: "Keep the 24-hour cache and split model options by selected make only if the catalog exceeds the 1,000-row guardrail.",
  },
  {
    area: "Production Call Frequency",
    files: ["scripts/check-db-usage.ts", "scripts/db-usage-snapshot.ts"],
    risk: "Small bounded queries can still create material transfer when called repeatedly under real traffic.",
    next: "Use a multi-hour production comparison to rank incremental calls and rows before changing cache boundaries.",
  },
  {
    area: "Production Measurement",
    files: ["scripts/db-usage-report.ts"],
    risk: "Local route warming cannot reproduce production traffic mix or cache eviction patterns.",
    next: "Run a multi-hour production window after deployment and compare query IDs, calls, and rows per call.",
  },
];

const APPLICATION_QUERY_FILTER = `
  AND (
    query ILIKE '%"public".%'
    OR query ILIKE '%from public.%'
    OR query ILIKE '%from "public".%'
  )
`;

const shouldReset = process.argv.includes("--reset");

async function main() {
  console.log("\nSUPERCAR DASH DB Usage Report");
  console.log(`Generated: ${new Date().toISOString()}\n`);

  const resetComplete = await reportPgStatStatements();
  if (resetComplete) return;
  await reportTableSizes();
  await reportCoreCounts();
  reportRiskAreas();
}

async function reportPgStatStatements() {
  console.log("1. Query Statistics\n");

  const ready = await ensurePgStatStatements();
  if (!ready) {
    console.log("- pg_stat_statements is not available from this connection.");
    console.log("- Enable it in Neon/Postgres, let traffic run for a few hours, then rerun `npm run db:usage-report`.\n");
    return false;
  }

  if (shouldReset) {
    await prisma.$executeRawUnsafe(`SELECT pg_stat_statements_reset()`);
    console.log("- Query statistics reset. Exercise representative routes, then rerun without `--reset`.\n");
    return true;
  }

  const [statInfo] = await prisma.$queryRawUnsafe<PgStatInfoRow[]>(`
    SELECT stats_reset
    FROM pg_stat_statements_info
  `);
  const statsReset = statInfo?.stats_reset ? new Date(statInfo.stats_reset) : null;
  if (statsReset && !Number.isNaN(statsReset.getTime())) {
    const elapsedHours = (Date.now() - statsReset.getTime()) / 3_600_000;
    console.log(`- Statistics window started: ${statsReset.toISOString()} (${elapsedHours.toFixed(1)} hours ago)\n`);
  }

  await printStatSection(
    "Top queries by total rows returned",
    `
      SELECT queryid::text AS query_id,
             query,
             calls,
             rows AS total_rows,
             CASE WHEN calls > 0 THEN rows::float / calls ELSE NULL END AS avg_rows_per_call
      FROM pg_stat_statements
      WHERE calls > 0
      ${APPLICATION_QUERY_FILTER}
      ORDER BY rows DESC
      LIMIT 15
    `,
  );

  await printStatSection(
    "Top queries by average rows per call",
    `
      SELECT queryid::text AS query_id,
             query,
             calls,
             rows AS total_rows,
             CASE WHEN calls > 0 THEN rows::float / calls ELSE NULL END AS avg_rows_per_call
      FROM pg_stat_statements
      WHERE calls > 0
      ${APPLICATION_QUERY_FILTER}
      ORDER BY avg_rows_per_call DESC NULLS LAST
      LIMIT 15
    `,
  );

  await printStatSection(
    "Most frequently called queries",
    `
      SELECT queryid::text AS query_id,
             query,
             calls,
             rows AS total_rows,
             CASE WHEN calls > 0 THEN rows::float / calls ELSE NULL END AS avg_rows_per_call
      FROM pg_stat_statements
      WHERE calls > 0
      ${APPLICATION_QUERY_FILTER}
      ORDER BY calls DESC
      LIMIT 15
    `,
  );

  await printStatSection(
    "Slowest queries by total execution time",
    `
      SELECT queryid::text AS query_id,
             query,
             calls,
             rows AS total_rows,
             CASE WHEN calls > 0 THEN rows::float / calls ELSE NULL END AS avg_rows_per_call,
             total_exec_time AS total_exec_time_ms
      FROM pg_stat_statements
      WHERE calls > 0
      ${APPLICATION_QUERY_FILTER}
      ORDER BY total_exec_time DESC
      LIMIT 15
    `,
  );
  return false;
}

async function ensurePgStatStatements() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`);
    await prisma.$queryRawUnsafe(`SELECT 1 FROM pg_stat_statements LIMIT 1`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`- Could not read pg_stat_statements: ${message.split("\n")[0]}`);
    return false;
  }
}

async function printStatSection(title: string, sql: string) {
  const rows = await prisma.$queryRawUnsafe<PgStatRow[]>(sql);
  console.log(`${title}:`);

  if (rows.length === 0) {
    console.log("- No query stats captured yet. Stats can reset when compute restarts.\n");
    return;
  }

  rows.forEach((row, index) => {
    const calls = Number(row.calls);
    const totalRows = Number(row.total_rows);
    const avgRows = row.avg_rows_per_call === null ? "n/a" : row.avg_rows_per_call.toFixed(1);
    const execTime = row.total_exec_time_ms === undefined || row.total_exec_time_ms === null
      ? ""
      : `, total time ${row.total_exec_time_ms.toFixed(1)}ms`;
    const riskFlags = getQueryRiskFlags(row.query);
    console.log(`${index + 1}. query ${String(row.query_id)}, calls ${calls.toLocaleString()}, rows ${totalRows.toLocaleString()}, avg rows/call ${avgRows}${execTime}`);
    if (riskFlags.length > 0) console.log(`   Risk: ${riskFlags.join(", ")}`);
    console.log(`   ${compactQuery(row.query)}`);
  });
  console.log("");
}

async function reportTableSizes() {
  console.log("2. Table Size Snapshot\n");
  const rows = await prisma.$queryRawUnsafe<TableSizeRow[]>(`
    SELECT pg_statio_user_tables.relname AS table_name,
           n_live_tup AS estimated_live_rows,
           CASE
             WHEN n_live_tup > 0 THEN pg_relation_size(relid)::bigint / n_live_tup
             ELSE 0
           END AS average_table_row_bytes,
           pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
           pg_size_pretty(pg_relation_size(relid)) AS table_size,
           pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
    FROM pg_catalog.pg_statio_user_tables
    JOIN pg_catalog.pg_stat_user_tables USING (relid)
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 20
  `);

  if (rows.length === 0) {
    console.log("- No user table stats found.\n");
    return;
  }

  for (const row of rows) {
    console.log(
      `- ${row.table_name}: ~${Number(row.estimated_live_rows).toLocaleString()} rows, total ${row.total_size} ` +
        `(table ${row.table_size}, indexes ${row.index_size}, avg table row ` +
        `${formatBytes(Number(row.average_table_row_bytes))})`,
    );
  }
  console.log("");
}

async function reportCoreCounts() {
  console.log("3. Core Row Counts\n");
  const counts = await Promise.allSettled([
    prisma.user.count(),
    prisma.vehicle.count(),
    prisma.listing.count(),
    prisma.partnerContact.count(),
    prisma.model.count(),
    prisma.modelImage.count(),
    prisma.performancePart.count(),
    prisma.partCompatibility.count(),
    prisma.vehiclePhoto.count(),
    prisma.serviceRecord.count(),
    prisma.carClub.count(),
    prisma.meet.count(),
  ]);

  const labels = [
    "Users",
    "Vehicles",
    "Listings",
    "Partner contacts",
    "Models",
    "Model images",
    "Performance parts",
    "Part compatibility rows",
    "Owner vehicle photos",
    "Service records",
    "Car clubs",
    "Meets",
  ];

  counts.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(`- ${labels[index]}: ${result.value.toLocaleString()}`);
    } else {
      console.log(`- ${labels[index]}: unavailable (${result.reason instanceof Error ? result.reason.message : result.reason})`);
    }
  });
  console.log("");
}

function reportRiskAreas() {
  console.log("4. Code-Level Egress Risk Areas\n");
  for (const risk of RISK_AREAS) {
    console.log(`- ${risk.area}`);
    console.log(`  Files: ${risk.files.join(", ")}`);
    console.log(`  Risk: ${risk.risk}`);
    console.log(`  Next: ${risk.next}`);
  }
  console.log("\nRecommended next sprint: collect a multi-hour production window, then optimize only query shapes with material incremental calls or rows.\n");
}

function compactQuery(query: string) {
  return query.replace(/\s+/g, " ").trim().slice(0, 720);
}

function getQueryRiskFlags(query: string) {
  const normalized = query.replace(/\s+/g, " ");
  const flags: string[] = [];
  const selectedColumns = normalized.match(/^SELECT (.+?) FROM /i)?.[1] || "";
  const selectedColumnCount = (selectedColumns.match(/"public"\./g) || []).length;

  if (selectedColumnCount >= 12) flags.push(`${selectedColumnCount} selected columns`);
  if (/"VehicleImage".* WHERE .*"vehicleId" IN/i.test(normalized)) flags.push("vehicle image fanout");
  if (/"Model".* WHERE .*"id" IN/i.test(normalized)) flags.push("model relation fanout");
  if (/"Listing".* WHERE .*"vehicleId" IN/i.test(normalized)) flags.push("listing relation fanout");
  if (!/ LIMIT /i.test(normalized) && / IN \(/i.test(normalized)) flags.push("unbounded relation result");

  return flags;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "n/a";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
