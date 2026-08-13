import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

type QueryStat = {
  queryId: string;
  query: string;
  calls: number;
  totalRows: number;
  averageRows: number;
};

type RawQueryStat = {
  query_id: bigint | number | string;
  query: string;
  calls: bigint | number;
  total_rows: bigint | number;
  average_rows: number | null;
};

type Finding = {
  level: "FAIL" | "WARN";
  message: string;
  query?: QueryStat;
};

const LIMITS = {
  anyQueryAverageRows: 1_000,
  vehicleImageAverageRows: 50,
  broadVehicleAverageRows: 100,
  listingAverageRows: 200,
  publicPartsPageAverageRows: 24,
} as const;

async function main() {
  console.log("\nSUPERCAR DASH Neon Usage Guardrail\n");

  const stats = await getQueryStats();
  const publicPartCount = await prisma.performancePart.count({
    where: {
      status: "ACTIVE",
      sourceUrl: { not: null },
      sourceConfidence: "SOURCE_VERIFIED",
      imageUrl: { not: null },
      compatibility: {
        some: {
          OR: [{ makeId: { not: null } }, { modelId: { not: null } }],
        },
      },
    },
  });

  const findings = evaluateQueryStats(stats);
  console.log(`Observed query shapes: ${stats.length.toLocaleString()}`);
  console.log(`Public catalog products: ${publicPartCount.toLocaleString()} (server-paginated)`);

  if (findings.length === 0) {
    console.log("\nPASS: no Neon usage guardrails were exceeded.\n");
    return;
  }

  console.log("");
  for (const finding of findings) {
    console.log(`${finding.level}: ${finding.message}`);
    if (finding.query) {
      console.log(
        `  query ${finding.query.queryId}, calls ${finding.query.calls.toLocaleString()}, ` +
          `avg rows/call ${finding.query.averageRows.toFixed(1)}`,
      );
      console.log(`  ${compactQuery(finding.query.query)}`);
    }
  }

  const failures = findings.filter((finding) => finding.level === "FAIL");
  if (failures.length > 0) {
    console.error(`\nFAILED: ${failures.length} Neon usage guardrail${failures.length === 1 ? "" : "s"} exceeded.\n`);
    process.exitCode = 1;
  } else {
    console.log("\nPASS with warnings.\n");
  }
}

async function getQueryStats(): Promise<QueryStat[]> {
  try {
    const rows = await prisma.$queryRaw<RawQueryStat[]>`
      SELECT
        queryid::text AS query_id,
        query,
        calls,
        rows AS total_rows,
        CASE WHEN calls > 0 THEN rows::float / calls ELSE NULL END AS average_rows
      FROM pg_stat_statements
      WHERE calls > 0
        AND (
          query ILIKE '%"public".%'
          OR query ILIKE '%from public.%'
          OR query ILIKE '%from "public".%'
        )
    `;

    return rows.map((row) => ({
      queryId: String(row.query_id),
      query: row.query,
      calls: Number(row.calls),
      totalRows: Number(row.total_rows),
      averageRows: Number(row.average_rows ?? 0),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`pg_stat_statements is unavailable; run npm run db:usage-report first. ${message.split("\n")[0]}`);
  }
}

function evaluateQueryStats(stats: QueryStat[]): Finding[] {
  const findings: Finding[] = [];

  for (const stat of stats) {
    const normalized = stat.query.replace(/\s+/g, " ");
    const selectedColumns = normalized.match(/^SELECT (.+?) FROM /i)?.[1] ?? "";
    const selectedColumnCount = (selectedColumns.match(/"public"\./g) ?? []).length;

    if (isVehicleImageQuery(normalized) && stat.averageRows > LIMITS.vehicleImageAverageRows) {
      findings.push({
        level: "FAIL",
        message: `Vehicle image relation returned more than ${LIMITS.vehicleImageAverageRows} rows per call.`,
        query: stat,
      });
      continue;
    }

    if (isBroadVehicleQuery(normalized, selectedColumnCount) && stat.averageRows > LIMITS.broadVehicleAverageRows) {
      findings.push({
        level: "FAIL",
        message: `Broad Vehicle query returned more than ${LIMITS.broadVehicleAverageRows} rows per call.`,
        query: stat,
      });
      continue;
    }

    if (isListingRowQuery(normalized) && stat.averageRows > LIMITS.listingAverageRows) {
      findings.push({
        level: "FAIL",
        message: `Listing row query returned more than ${LIMITS.listingAverageRows} rows per call.`,
        query: stat,
      });
      continue;
    }

    if (isPublicPartsPageQuery(normalized) && stat.averageRows > LIMITS.publicPartsPageAverageRows) {
      findings.push({
        level: "FAIL",
        message: `Public parts storefront returned more than ${LIMITS.publicPartsPageAverageRows} products per call.`,
        query: stat,
      });
      continue;
    }

    if (stat.averageRows > LIMITS.anyQueryAverageRows) {
      findings.push({
        level: "FAIL",
        message: `Application query returned more than ${LIMITS.anyQueryAverageRows.toLocaleString()} rows per call.`,
        query: stat,
      });
    }
  }

  return findings;
}

function isVehicleImageQuery(query: string) {
  return /FROM "public"\."VehicleImage"/i.test(query) && /"vehicleId" IN/i.test(query);
}

function isBroadVehicleQuery(query: string, selectedColumnCount: number) {
  return /FROM "public"\."Vehicle"/i.test(query) && selectedColumnCount >= 20;
}

function isListingRowQuery(query: string) {
  return /^SELECT /i.test(query) && /FROM "public"\."Listing"/i.test(query) && !/^SELECT (COUNT|SUM|AVG|MIN|MAX)\(/i.test(query);
}

function isPublicPartsPageQuery(query: string) {
  return /^SELECT /i.test(query)
    && /FROM "public"\."PerformancePart"/i.test(query)
    && /"public"\."PerformancePart"\."description"/i.test(query);
}

function compactQuery(query: string) {
  return query.replace(/\s+/g, " ").trim().slice(0, 520);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
