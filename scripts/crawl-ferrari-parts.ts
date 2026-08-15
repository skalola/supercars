import { prisma } from "../lib/prisma";
import { crawlScuderiaFerrariCatalog } from "../lib/parts/sources/scuderia";

function readPositiveInteger(name: string) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

async function main() {
  const report = await crawlScuderiaFerrariCatalog({
    prisma,
    maxModels: readPositiveInteger("max-models"),
    maxDiagramsPerModel: readPositiveInteger("max-diagrams-per-model"),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.failedSourceUrls.length && report.canonicalPartsImported === 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
