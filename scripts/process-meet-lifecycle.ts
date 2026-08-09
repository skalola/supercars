import { prisma } from "@/lib/prisma";
import { processMeetLifecycle } from "@/lib/meets/meet-lifecycle";

async function main() {
  const result = await processMeetLifecycle();
  console.log(
    [
      `Sent ${result.reminderCount} meet reminder${result.reminderCount === 1 ? "" : "s"}.`,
      `Completed ${result.completedCount} past meet${result.completedCount === 1 ? "" : "s"}.`,
      `Reminder window ends at ${result.reminderWindowEnd.toISOString()}.`,
    ].join(" ")
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
