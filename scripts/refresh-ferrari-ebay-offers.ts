import { prisma } from "../lib/prisma";
import { refreshFerrariEbayOffers } from "../lib/parts/offer-refresh";

function readLimit() {
  const raw = process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1];
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 500) throw new Error("limit must be between 1 and 500.");
  return value;
}

async function main() {
  const report = await refreshFerrariEbayOffers(prisma, { limit: readLimit() });
  console.log(JSON.stringify(report, null, 2));
  if (report.failedParts.length === report.partsChecked && report.partsChecked > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
