import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });
const REGRESSION_MODELS = ["458-italia", "488-gtb", "f8-tributo", "f430", "sf90-stradale", "812-superfast", "f12berlinetta"];
const REGRESSION_COMPONENTS = [
  "engine-air-filter",
  "oil-filter",
  "spark-plugs",
  "front-brake-pads",
  "front-brake-rotors",
  "battery",
  "performance-exhaust",
  "lowering-spring",
  "forged-wheel",
];

async function main() {
  const now = new Date();
  const mappings = await prisma.modelPartComponent.findMany({
    where: {
      active: true,
      model: { slug: { in: REGRESSION_MODELS }, make: { slug: "ferrari" } },
      componentType: { slug: { in: REGRESSION_COMPONENTS } },
    },
    select: {
      lastOfferSearchStatus: true,
      lastOfferRejectedCount: true,
      model: { select: { name: true, slug: true } },
      componentType: { select: { name: true, slug: true, category: { select: { name: true, slug: true } } } },
      offerContexts: {
        where: {
          active: true,
          offer: {
            provider: "EBAY",
            active: true,
            affiliateUrl: { not: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
        select: { fitmentConfidence: true, offer: { select: { affiliateUrl: true } } },
      },
    },
    orderBy: [{ model: { name: "asc" } }, { componentType: { name: "asc" } }],
  });

  const rows = mappings.map((mapping) => {
    const confidences = new Set(mapping.offerContexts.map((context) => normalizeConfidence(context.fitmentConfidence)));
    return {
      model: mapping.model.name,
      modelSlug: mapping.model.slug,
      system: mapping.componentType.category.name,
      systemSlug: mapping.componentType.category.slug,
      component: mapping.componentType.name,
      componentSlug: mapping.componentType.slug,
      exactMatches: confidences.has("EXACT_MATCH"),
      highConfidence: confidences.has("HIGH_CONFIDENCE"),
      likelyCompatible: confidences.has("LIKELY_COMPATIBLE"),
      activeOffers: mapping.offerContexts.length,
      status: mapping.lastOfferSearchStatus,
      rejectedListings: mapping.lastOfferRejectedCount,
      affiliateUrlsValid: mapping.offerContexts.every((context) => Boolean(context.offer.affiliateUrl)),
    };
  });
  console.log(JSON.stringify({
    regressionModelsRequested: REGRESSION_MODELS.length,
    regressionComponentsRequested: REGRESSION_COMPONENTS.length,
    componentsChecked: rows.length,
    componentsWithExactMatches: rows.filter((row) => row.exactMatches).length,
    componentsWithHighConfidenceMatches: rows.filter((row) => row.highConfidence).length,
    componentsWithLikelyCompatibleMatches: rows.filter((row) => row.likelyCompatible).length,
    componentsWithZeroOffers: rows.filter((row) => row.activeOffers === 0).length,
    componentsWithOnlyRejectedOffers: rows.filter((row) =>
      row.activeOffers === 0 && (row.status === "LOW_CONFIDENCE_ONLY" || row.rejectedListings > 0),
    ).length,
    apiErrors: rows.filter((row) => row.status === "API_ERROR").length,
    cacheMisses: rows.filter((row) => ["NEVER", "RUNNING"].includes(row.status)).length,
    affiliateUrlCoverage: rows.every((row) => row.affiliateUrlsValid) ? "100%" : "INCOMPLETE",
    coverage: rows,
  }, null, 2));
}

function normalizeConfidence(value: string) {
  if (value === "HIGH") return "HIGH_CONFIDENCE";
  if (value === "POSSIBLE") return "LIKELY_COMPATIBLE";
  return value;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
