import { PrismaClient } from "@prisma/client";
import { getPartOfferRetentionCutoffs, PART_OFFER_RETENTION_POLICY } from "../lib/parts/offer-retention";

const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const executeTransitions = process.argv.includes("--execute-transitions");
  const purge = process.argv.includes("--purge");
  const cutoffs = getPartOfferRetentionCutoffs();
  const [expiring, agingStale, purgeable] = await Promise.all([
    prisma.partOffer.count({
      where: { provider: "EBAY", active: true, expiresAt: { lte: cutoffs.expiredAt } },
    }),
    prisma.partOffer.count({
      where: { provider: "EBAY", active: false, availability: "STALE", lastSeenAt: { lt: cutoffs.inactiveBefore } },
    }),
    prisma.partOffer.count({
      where: { provider: "EBAY", active: false, availability: "INACTIVE", lastSeenAt: { lt: cutoffs.purgeBefore } },
    }),
  ]);

  let staleTransitions = 0;
  let inactiveTransitions = 0;
  let purged = 0;
  if (executeTransitions || purge) {
    staleTransitions = (await prisma.partOffer.updateMany({
      where: { provider: "EBAY", active: true, expiresAt: { lte: cutoffs.expiredAt } },
      data: { active: false, availability: "STALE", lastCheckedAt: cutoffs.expiredAt },
    })).count;
    inactiveTransitions = (await prisma.partOffer.updateMany({
      where: { provider: "EBAY", active: false, availability: "STALE", lastSeenAt: { lt: cutoffs.inactiveBefore } },
      data: { availability: "INACTIVE", lastCheckedAt: cutoffs.expiredAt },
    })).count;
  }
  if (purge) {
    purged = (await prisma.partOffer.deleteMany({
      where: { provider: "EBAY", active: false, availability: "INACTIVE", lastSeenAt: { lt: cutoffs.purgeBefore } },
    })).count;
  }

  console.log(JSON.stringify({
    mode: purge ? "PURGE" : executeTransitions ? "TRANSITIONS" : "DRY_RUN",
    policy: PART_OFFER_RETENTION_POLICY,
    candidates: { activeToStale: expiring, staleToInactive: agingStale, inactiveToPurge: purgeable },
    changed: { staleTransitions, inactiveTransitions, purged },
    canonicalPartsPreserved: true,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
