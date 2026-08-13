import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

type QueryStat = {
  queryId: string;
  query: string;
  calls: number;
  totalRows: number;
  averageRows: number;
  selectedColumnCount: number;
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
  publicPartsCompatibilityAverageRows: 288,
  makeModelCatalogAverageRows: 1_000,
} as const;

async function main() {
  console.log("\nSUPERCAR DASH Neon Usage Guardrail\n");

  const stats = await getQueryStats();
  const [publicPartCountRow] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH supercar_dash_usage_diagnostic AS (
      SELECT count(*) AS count
      FROM "public"."PerformancePart" part
      WHERE part.status = 'ACTIVE'
        AND part."sourceUrl" IS NOT NULL
        AND part."sourceConfidence" = 'SOURCE_VERIFIED'
        AND part."imageUrl" IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM "public"."PartCompatibility" compatibility
          WHERE compatibility."partId" = part.id
            AND (compatibility."makeId" IS NOT NULL OR compatibility."modelId" IS NOT NULL)
        )
    )
    SELECT count FROM supercar_dash_usage_diagnostic
  `;
  const publicPartCount = Number(publicPartCountRow?.count ?? 0);

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
        AND query NOT ILIKE ('%' || 'supercar_dash_usage_' || 'diagnostic' || '%')
    `;

    return rows.map((row) => ({
      queryId: String(row.query_id),
      query: row.query,
      calls: Number(row.calls),
      totalRows: Number(row.total_rows),
      averageRows: Number(row.average_rows ?? 0),
      selectedColumnCount: countSelectedColumns(row.query),
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
    const selectedColumnCount = stat.selectedColumnCount;

    if (isMakeModelCatalogQuery(normalized) && stat.averageRows > LIMITS.makeModelCatalogAverageRows) {
      findings.push({
        level: "FAIL",
        message: `Shared make/model catalog returned more than ${LIMITS.makeModelCatalogAverageRows.toLocaleString()} rows per cache fill.`,
        query: stat,
      });
      continue;
    }

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

    if (isPublicPartsCompatibilityQuery(normalized) && stat.averageRows > LIMITS.publicPartsCompatibilityAverageRows) {
      findings.push({
        level: "FAIL",
        message: `Public parts compatibility fanout returned more than ${LIMITS.publicPartsCompatibilityAverageRows} rows per 24-product page.`,
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

function isMakeModelCatalogQuery(query: string) {
  return /^SELECT /i.test(query)
    && (/FROM "public"\."Make"/i.test(query) || /FROM "public"\."Model"/i.test(query))
    && /ORDER BY /i.test(query);
}

function isPublicPartsCompatibilityQuery(query: string) {
  return /^SELECT /i.test(query)
    && /FROM "public"\."PartCompatibility"/i.test(query)
    && /"partId" IN/i.test(query);
}

function countSelectedColumns(query: string) {
  const normalized = query.replace(/\s+/g, " ");
  const selectedColumns = normalized.match(/^SELECT (.+?) FROM /i)?.[1] ?? "";
  return (selectedColumns.match(/"public"\./g) ?? []).length;
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
