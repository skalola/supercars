import { processMaintenanceTrackerAlerts } from "@/lib/trackers/maintenance-alerts";
import { prisma } from "@/lib/prisma";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const result = await processMaintenanceTrackerAlerts({ dryRun });
  console.log(JSON.stringify({ dryRun, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
