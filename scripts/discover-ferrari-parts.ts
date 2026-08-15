import { prisma } from "../lib/prisma";
import { discoverFerrariParts } from "../lib/parts/ferrari-discovery";

function readInteger(name: string, fallback: number, maximum: number) {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=")[1];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be an integer between 0 and ${maximum}.`);
  }
  return value;
}

function readList(name: string) {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=")[1];
  return raw?.split(",").map((value) => value.trim()).filter(Boolean);
}

async function main() {
  const report = await discoverFerrariParts(prisma, {
    maxQueries: readInteger("max-queries", 100, 5_000),
    resultsPerQuery: readInteger("results-per-query", 20, 50),
    delayMs: readInteger("delay-ms", 350, 10_000),
    refreshHours: readInteger("refresh-hours", 168, 8_760),
    maxRetries: readInteger("max-retries", 2, 5),
    modelSlugs: readList("models"),
    categorySlugs: readList("categories"),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.stoppedByRateLimit) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
