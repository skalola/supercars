import { getFerrariComponentOffers } from "../lib/parts/ferrari-component-service";
import { prisma } from "../lib/prisma";

const CASES = [
  ["458 Italia", "Engine Air Filter"],
  ["458 Italia", "Oil Filter"],
  ["458 Italia", "Front Brake Pads"],
  ["458 Italia", "Performance Exhaust"],
  ["488 GTB", "Engine Air Filter"],
  ["488 GTB", "Front Brake Pads"],
  ["488 GTB", "Performance Exhaust"],
  ["F8 Tributo", "Engine Air Filter"],
  ["F8 Tributo", "Performance Exhaust"],
  ["F8 Tributo", "Forged Wheel"],
  ["F430", "Oil Filter"],
  ["F430", "Front Brake Pads"],
] as const;

async function main() {
  const rows = [];
  for (const [modelName, componentName] of CASES) {
    const mapping = await prisma.modelPartComponent.findFirst({
      where: {
        active: true,
        model: { name: modelName, make: { slug: "ferrari" } },
        componentType: { name: componentName, active: true },
      },
      select: {
        model: { select: { slug: true, productionStartYear: true, productionEndYear: true } },
        componentType: { select: { slug: true, category: { select: { slug: true } } } },
      },
    });
    if (!mapping) {
      rows.push({ model: modelName, component: componentName, status: "MAPPING_MISSING" });
      continue;
    }
    try {
      const result = await getFerrariComponentOffers({
        modelSlug: mapping.model.slug,
        componentSlug: mapping.componentType.slug,
        categorySlug: mapping.componentType.category.slug,
        year: mapping.model.productionEndYear ?? mapping.model.productionStartYear,
        forceRefresh: true,
      });
      rows.push({
        model: modelName,
        component: componentName,
        rawEbayResults: result?.discovery?.examinedResults ?? 0,
        acceptedOffers: result?.discovery?.acceptedResults ?? 0,
        rejectedOffers: result?.discovery?.rejectedResults ?? 0,
        affiliateEnabledOffers: result?.offers.filter((offer) => Boolean(offer.itemAffiliateWebUrl)).length ?? 0,
        offersRendered: result?.offers.length ?? 0,
        status: result?.cache.status ?? "NOT_FOUND",
      });
    } catch (error) {
      rows.push({
        model: modelName,
        component: componentName,
        status: error instanceof Error ? `ERROR: ${error.message}` : "ERROR",
      });
    }
  }
  console.log(JSON.stringify({ cases: rows.length, rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
