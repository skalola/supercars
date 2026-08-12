import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_MEET_PATTERNS = [
  "test",
  "demo",
  "sample",
  "placeholder",
  "charlotte supercar breakfast",
  "miami coastal cruise",
  "canyon run",
  "midtown meet",
  "lakeside drive",
  "mountain loop",
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const candidates = await prisma.meet.findMany({
    where: {
      OR: [
        ...TEST_MEET_PATTERNS.map((pattern) => ({ title: { contains: pattern, mode: "insensitive" as const } })),
        ...TEST_MEET_PATTERNS.map((pattern) => ({ slug: { contains: slugify(pattern), mode: "insensitive" as const } })),
        { host: { email: { contains: "test", mode: "insensitive" } } },
        { host: { email: { endsWith: ".test", mode: "insensitive" } } },
        { host: { username: { contains: "test", mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      city: true,
      state: true,
      startsAt: true,
      host: { select: { email: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (candidates.length === 0) {
    console.log("[cleanup-test-meets] No test/demo meets found.");
    return;
  }

  console.log(`[cleanup-test-meets] Found ${candidates.length} test/demo meet${candidates.length === 1 ? "" : "s"}:`);
  candidates.forEach((meet) => {
    console.log(
      `- ${meet.title} (${meet.slug}) ${meet.city}, ${meet.state} host=${meet.host.email || meet.host.username || "unknown"} starts=${meet.startsAt.toISOString()}`,
    );
  });

  if (dryRun) {
    console.log("[cleanup-test-meets] Dry run only. Re-run without --dry-run to delete.");
    return;
  }

  const result = await prisma.meet.deleteMany({
    where: { id: { in: candidates.map((meet) => meet.id) } },
  });
  console.log(`[cleanup-test-meets] Deleted ${result.count} meet${result.count === 1 ? "" : "s"}.`);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

main()
  .catch((error) => {
    console.error("[cleanup-test-meets] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
