import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

type RawQueryStat = {
  query_id: bigint | number | string;
  query: string;
  calls: bigint | number;
  total_rows: bigint | number;
  total_exec_time_ms: number;
};

type SnapshotQuery = {
  queryId: string;
  query: string;
  calls: number;
  rows: number;
  totalExecTimeMs: number;
};

type UsageSnapshot = {
  version: 1;
  capturedAt: string;
  statsResetAt: string | null;
  queries: SnapshotQuery[];
};

type QueryDelta = SnapshotQuery & {
  callsDelta: number;
  rowsDelta: number;
  execTimeDeltaMs: number;
};

const writePath = getArgument("--write") || ".neon-usage/baseline.json";
const comparePath = getArgument("--compare");

async function main() {
  const snapshot = await captureSnapshot();

  if (comparePath) {
    const baseline = await readSnapshot(comparePath);
    compareSnapshots(baseline, snapshot);
  }

  if (!comparePath || process.argv.some((argument) => argument.startsWith("--write"))) {
    await saveSnapshot(writePath, snapshot);
  }
}

async function captureSnapshot(): Promise<UsageSnapshot> {
  const [info] = await prisma.$queryRaw<Array<{ stats_reset: Date | string | null }>>`
    SELECT stats_reset FROM pg_stat_statements_info
  `;
  const rows = await prisma.$queryRaw<RawQueryStat[]>`
    SELECT
      queryid::text AS query_id,
      query,
      calls,
      rows AS total_rows,
      total_exec_time AS total_exec_time_ms
    FROM pg_stat_statements
    WHERE calls > 0
      AND (
        query ILIKE '%"public".%'
        OR query ILIKE '%from public.%'
        OR query ILIKE '%from "public".%'
      )
  `;

  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    statsResetAt: info?.stats_reset ? new Date(info.stats_reset).toISOString() : null,
    queries: rows.map((row) => ({
      queryId: String(row.query_id),
      query: row.query.replace(/\s+/g, " ").trim(),
      calls: Number(row.calls),
      rows: Number(row.total_rows),
      totalExecTimeMs: Number(row.total_exec_time_ms),
    })),
  };
}

async function readSnapshot(path: string): Promise<UsageSnapshot> {
  const absolutePath = resolve(path);
  const parsed = JSON.parse(await readFile(absolutePath, "utf8")) as UsageSnapshot;
  if (parsed.version !== 1 || !Array.isArray(parsed.queries)) {
    throw new Error(`Unsupported Neon usage snapshot: ${absolutePath}`);
  }
  return parsed;
}

async function saveSnapshot(path: string, snapshot: UsageSnapshot) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Saved Neon usage baseline: ${absolutePath}`);
  printTotals("Baseline totals", snapshot.queries);
}

function compareSnapshots(baseline: UsageSnapshot, current: UsageSnapshot) {
  if (baseline.statsResetAt !== current.statsResetAt) {
    throw new Error(
      "PostgreSQL query statistics reset after the baseline was captured. Capture a new baseline before comparing traffic.",
    );
  }

  const baselineById = new Map(baseline.queries.map((query) => [query.queryId, query]));
  const deltas = current.queries
    .map<QueryDelta>((query) => {
      const previous = baselineById.get(query.queryId);
      return {
        ...query,
        callsDelta: query.calls - (previous?.calls || 0),
        rowsDelta: query.rows - (previous?.rows || 0),
        execTimeDeltaMs: query.totalExecTimeMs - (previous?.totalExecTimeMs || 0),
      };
    })
    .filter((query) => query.callsDelta > 0 || query.rowsDelta > 0 || query.execTimeDeltaMs > 0);

  if (deltas.some((query) => query.callsDelta < 0 || query.rowsDelta < 0)) {
    throw new Error("Query counters decreased unexpectedly. Capture a new baseline before comparing traffic.");
  }

  const elapsedHours = Math.max(
    (new Date(current.capturedAt).getTime() - new Date(baseline.capturedAt).getTime()) / 3_600_000,
    0,
  );
  console.log("\nSUPERCAR DASH Neon Usage Comparison");
  console.log(`Window: ${baseline.capturedAt} to ${current.capturedAt} (${elapsedHours.toFixed(2)} hours)`);
  console.log(`Observed query shapes: ${deltas.length.toLocaleString()}\n`);

  printDeltaSection("Top incremental rows", deltas, "rowsDelta");
  printDeltaSection("Top incremental calls", deltas, "callsDelta");
  printDeltaSection("Top incremental execution time", deltas, "execTimeDeltaMs");
}

function printDeltaSection(title: string, deltas: QueryDelta[], key: keyof QueryDelta) {
  console.log(`${title}:`);
  const ranked = [...deltas]
    .sort((left, right) => Number(right[key]) - Number(left[key]))
    .slice(0, 12);

  if (ranked.length === 0) {
    console.log("- No application queries recorded.\n");
    return;
  }

  ranked.forEach((query, index) => {
    const averageRows = query.callsDelta > 0 ? query.rowsDelta / query.callsDelta : 0;
    console.log(
      `${index + 1}. query ${query.queryId}: +${query.callsDelta.toLocaleString()} calls, ` +
        `+${query.rowsDelta.toLocaleString()} rows, ${averageRows.toFixed(1)} rows/call, ` +
        `+${query.execTimeDeltaMs.toFixed(1)}ms`,
    );
    console.log(`   ${query.query.slice(0, 520)}`);
  });
  console.log("");
}

function printTotals(title: string, queries: SnapshotQuery[]) {
  const totals = queries.reduce(
    (result, query) => ({
      calls: result.calls + query.calls,
      rows: result.rows + query.rows,
      totalExecTimeMs: result.totalExecTimeMs + query.totalExecTimeMs,
    }),
    { calls: 0, rows: 0, totalExecTimeMs: 0 },
  );
  console.log(
    `${title}: ${totals.calls.toLocaleString()} calls, ${totals.rows.toLocaleString()} rows, ` +
      `${totals.totalExecTimeMs.toFixed(1)}ms execution time`,
  );
}

function getArgument(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
