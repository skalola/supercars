import { prisma } from "@/lib/prisma";
import { processExpiredFulfillmentRequests } from "@/lib/fulfillment/service";

async function main() {
  const result = await processExpiredFulfillmentRequests();
  console.log(
    `Processed ${result.processedCount} expired fulfillment request${result.processedCount === 1 ? "" : "s"}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
