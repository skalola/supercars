import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const placeholderResult = await prisma.partBrand.updateMany({
    where: {
      logoUrl: {
        startsWith: "/parts/placeholders/brand/",
      },
    },
    data: {
      logoUrl: null,
      logoBackground: "GENERATED_PLACEHOLDER",
      logoNeedsReview: true,
      logoVerifiedAt: null,
    },
  });

  const unverifiedResult = await prisma.partBrand.updateMany({
    where: {
      logoUrl: {
        not: null,
      },
      OR: [
        { logoBackground: { not: "TRANSPARENT" } },
        { logoNeedsReview: true },
      ],
    },
    data: {
      logoNeedsReview: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        placeholderLogosCleared: placeholderResult.count,
        unverifiedLogosFlagged: unverifiedResult.count,
      },
      null,
      2
    )
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
