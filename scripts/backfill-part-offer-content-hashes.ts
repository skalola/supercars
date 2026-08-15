import { PrismaClient } from "@prisma/client";
import { buildPartOfferContentHash } from "../lib/parts/offer-content-hash";

const prisma = new PrismaClient({ log: ["error"] });
const BATCH_SIZE = 250;

async function main() {
  let cursor: string | undefined;
  let offersScanned = 0;
  let fingerprintsWritten = 0;

  while (true) {
    const offers = await prisma.partOffer.findMany({
      where: { contentHash: null },
      select: {
        id: true,
        provider: true,
        externalItemId: true,
        title: true,
        priceCents: true,
        currency: true,
        condition: true,
        sellerName: true,
        sellerFeedbackPercentage: true,
        sellerQualityScore: true,
        imageUrl: true,
        affiliateUrl: true,
        sourceUrl: true,
        availability: true,
        oemMatchType: true,
        genuineOemStatus: true,
        compatibilityStatus: true,
        fitmentConfidence: true,
        confidenceScore: true,
        shippingCostCents: true,
        shippingCurrency: true,
        affiliateReferenceId: true,
        itemEndDate: true,
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (offers.length === 0) break;

    await prisma.$transaction(offers.map((offer) => prisma.partOffer.update({
      where: { id: offer.id },
      data: { contentHash: buildPartOfferContentHash(offer) },
      select: { id: true },
    })));
    offersScanned += offers.length;
    fingerprintsWritten += offers.length;
    cursor = offers.at(-1)?.id;
    if (offers.length < BATCH_SIZE) break;
  }

  console.log(JSON.stringify({ offersScanned, fingerprintsWritten, batchSize: BATCH_SIZE }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
