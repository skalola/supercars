import { PrismaClient } from "@prisma/client";
import { geocodeLocation } from "@/lib/location/geocode";

const prisma = new PrismaClient();

async function main() {
  const meets = await prisma.meet.findMany({
    where: {
      OR: [
        { latitude: null },
        { longitude: null },
      ],
    },
    select: {
      id: true,
      title: true,
      city: true,
      state: true,
    },
    orderBy: { startsAt: "asc" },
  });

  let updated = 0;
  let unresolved = 0;

  for (const meet of meets) {
    const coordinates = await geocodeLocation(`${meet.city}, ${meet.state}`);
    if (!coordinates) {
      unresolved += 1;
      console.warn(`[backfill-meet-coordinates] Could not resolve ${meet.title}: ${meet.city}, ${meet.state}`);
      continue;
    }

    await prisma.meet.update({
      where: { id: meet.id },
      data: {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      },
    });
    updated += 1;
    console.log(`[backfill-meet-coordinates] ${meet.title}: ${coordinates.latitude}, ${coordinates.longitude}`);
  }

  console.log(`[backfill-meet-coordinates] Updated ${updated} meets. Unresolved: ${unresolved}.`);
}

main()
  .catch((error) => {
    console.error("[backfill-meet-coordinates] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
