import { getFerrariComponentOffers } from "../lib/parts/ferrari-component-service";
import { prisma } from "../lib/prisma";

const PRIORITY_COMPONENTS = [
  "Oil Filter",
  "Engine Air Filter",
  "Cabin Air Filter",
  "Spark Plugs",
  "Battery",
  "Front Brake Pads",
  "Rear Brake Pads",
  "Front Brake Rotors",
  "Rear Brake Rotors",
  "Brake Wear Sensor",
  "Performance Exhaust",
  "Intake",
  "Lowering Spring",
  "Forged Wheel",
  "TPMS Sensor",
  "Car Cover",
  "Battery Tender",
];
const PRIORITY_MODELS = ["458 Italia", "488 GTB", "F8 Tributo", "F430", "SF90 Stradale", "812 Superfast", "F12berlinetta"];

function readLimit() {
  const raw = process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1];
  if (!raw) return 50;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 500) throw new Error("limit must be between 1 and 500.");
  return value;
}

async function main() {
  const candidates = await prisma.modelPartComponent.findMany({
    where: {
      active: true,
      model: { make: { slug: "ferrari" } },
      componentType: { active: true, name: { in: PRIORITY_COMPONENTS, mode: "insensitive" } },
    },
    select: {
      model: { select: { name: true, slug: true, productionStartYear: true, productionEndYear: true } },
      componentType: { select: { name: true, slug: true, category: { select: { slug: true } } } },
    },
    orderBy: [{ lastOfferSearchAt: "asc" }, { model: { name: "asc" } }],
    take: 500,
  });
  const mappings = candidates.sort((left, right) => {
    const leftModel = PRIORITY_MODELS.indexOf(left.model.name);
    const rightModel = PRIORITY_MODELS.indexOf(right.model.name);
    if (leftModel !== rightModel) return (leftModel < 0 ? 999 : leftModel) - (rightModel < 0 ? 999 : rightModel);
    return PRIORITY_COMPONENTS.indexOf(left.componentType.name) - PRIORITY_COMPONENTS.indexOf(right.componentType.name);
  }).slice(0, readLimit());

  const rows = [];
  for (const mapping of mappings) {
    try {
      const result = await getFerrariComponentOffers({
        modelSlug: mapping.model.slug,
        componentSlug: mapping.componentType.slug,
        categorySlug: mapping.componentType.category.slug,
        year: mapping.model.productionEndYear ?? mapping.model.productionStartYear,
        forceRefresh: true,
      });
      rows.push({
        model: mapping.model.name,
        component: mapping.componentType.name,
        rawResults: result?.discovery?.examinedResults ?? 0,
        acceptedOffers: result?.offers.length ?? 0,
        rejectedOffers: result?.discovery?.rejectedResults ?? 0,
        affiliateEnabledOffers: result?.offers.filter((offer) => Boolean(offer.itemAffiliateWebUrl)).length ?? 0,
        status: result?.cache.status ?? "NOT_FOUND",
      });
    } catch (error) {
      rows.push({
        model: mapping.model.name,
        component: mapping.componentType.name,
        rawResults: 0,
        acceptedOffers: 0,
        rejectedOffers: 0,
        affiliateEnabledOffers: 0,
        status: error instanceof Error ? `ERROR: ${error.message}` : "ERROR",
      });
    }
  }
  console.log(JSON.stringify({
    mappingsSelected: mappings.length,
    mappingsWithOffers: rows.filter((row) => row.acceptedOffers > 0).length,
    totalAcceptedOffers: rows.reduce((sum, row) => sum + row.acceptedOffers, 0),
    totalAffiliateEnabledOffers: rows.reduce((sum, row) => sum + row.affiliateEnabledOffers, 0),
    rows,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
