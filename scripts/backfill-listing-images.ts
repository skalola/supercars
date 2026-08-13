import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getBatchLimit } from "./lib/script-guards";

async function main() {
  const limit = getBatchLimit({ defaultLimit: 500, maxLimit: 1000 });
  const listings = await prisma.listing.findMany({
    where: {
      imageUrl: null,
      vehicle: {
        is: {
          images: {
            some: {},
          },
        },
      },
    },
    select: {
      id: true,
      vehicle: {
        select: {
          images: {
            where: { validationStatus: "VALID" },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              url: true,
            },
            take: 1,
          },
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  const updates = listings.flatMap((listing) => {
    const image = listing.vehicle?.images[0];
    return image?.url ? [{ id: listing.id, imageUrl: image.url }] : [];
  });

  const updated = updates.length === 0
    ? 0
    : await prisma.$executeRaw(Prisma.sql`
        UPDATE "Listing" listing
        SET "imageUrl" = updates."imageUrl",
            "updatedAt" = NOW()
        FROM (VALUES ${Prisma.join(
          updates.map((update) => Prisma.sql`(${update.id}, ${update.imageUrl})`),
        )}) AS updates("id", "imageUrl")
        WHERE listing."id" = updates."id"
          AND listing."imageUrl" IS NULL
      `);

  console.log(JSON.stringify({ limit, inspected: listings.length, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error("Listing image backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
