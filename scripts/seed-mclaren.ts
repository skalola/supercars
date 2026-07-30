import mclarenCatalog from "../data/mclaren.json";
import { prisma } from "../lib/prisma";
import { buildSalesEmailForWebsite } from "../lib/directory/contact-domain-policy";
import { upsertPartnerContact } from "../lib/fulfillment/partner-registry";
import { MCLAREN_DEALERS } from "../lib/market-crawlers/dealer-registry";

type CatalogModel = (typeof mclarenCatalog.models)[number];

const MAINTENANCE_TEMPLATES = [
  {
    category: "Annual Service",
    serviceName: "McLaren annual inspection and fluid service",
    description: "Annual inspection, diagnostic scan, oil service, brake fluid review, tire condition review and road test at a McLaren-qualified facility.",
    intervalMonths: 12,
    priority: "RECOMMENDED",
  },
  {
    category: "Powertrain",
    serviceName: "Twin-turbo powertrain inspection",
    description: "Inspect turbo plumbing, cooling system, accessory drive, mounts and visible oil/coolant leaks for McLaren Sports/Super Series cars.",
    intervalMiles: 10000,
    intervalMonths: 24,
    priority: "RECOMMENDED",
  },
  {
    category: "Hybrid System",
    serviceName: "Hybrid battery and high-voltage system health check",
    description: "For Artura, P1 and Speedtail models, verify hybrid-system health, cooling and software status during routine service.",
    intervalMonths: 12,
    priority: "HIGH",
    modelSlugs: ["artura", "p1", "speedtail"],
  },
];

async function seedCatalogModel(makeId: string, catalogModel: CatalogModel) {
  const model = await prisma.model.upsert({
    where: {
      makeId_slug: {
        makeId,
        slug: catalogModel.slug,
      },
    },
    update: {
      name: catalogModel.name,
      years: formatYears(catalogModel),
      productionStartYear: catalogModel.productionStartYear ?? null,
      productionEndYear: catalogModel.productionEndYear ?? null,
      category: catalogModel.category ?? null,
      bodyStyle: catalogModel.bodyStyle ?? null,
      productionCount: catalogModel.productionCount ?? null,
      description: catalogModel.description ?? null,
    },
    create: {
      makeId,
      name: catalogModel.name,
      slug: catalogModel.slug,
      years: formatYears(catalogModel),
      productionStartYear: catalogModel.productionStartYear ?? null,
      productionEndYear: catalogModel.productionEndYear ?? null,
      category: catalogModel.category ?? null,
      bodyStyle: catalogModel.bodyStyle ?? null,
      productionCount: catalogModel.productionCount ?? null,
      description: catalogModel.description ?? null,
    },
  });

  if (catalogModel.spec) {
    await prisma.modelSpec.upsert({
      where: { modelId: model.id },
      update: catalogModel.spec,
      create: {
        modelId: model.id,
        ...catalogModel.spec,
      },
    });
  }

  for (const variant of catalogModel.variants ?? []) {
    await prisma.modelVariant.upsert({
      where: {
        modelId_slug: {
          modelId: model.id,
          slug: variant.slug,
        },
      },
      update: variant,
      create: {
        modelId: model.id,
        ...variant,
      },
    });
  }

  return model;
}

async function seedMaintenance(makeId: string) {
  const models = await prisma.model.findMany({
    where: { makeId },
    select: { id: true, slug: true },
  });

  for (const model of models) {
    for (const template of MAINTENANCE_TEMPLATES) {
      if ("modelSlugs" in template && template.modelSlugs && !template.modelSlugs.includes(model.slug)) continue;
      if (!("modelSlugs" in template) && ["p1", "speedtail"].includes(model.slug)) continue;

      const existing = await prisma.maintenanceRule.findFirst({
        where: {
          modelId: model.id,
          category: template.category,
          serviceName: template.serviceName,
        },
        select: { id: true },
      });

      const data = {
        category: template.category,
        serviceName: template.serviceName,
        description: template.description,
        intervalMiles: template.intervalMiles ?? null,
        intervalMonths: template.intervalMonths ?? null,
        priority: template.priority,
      };

      if (existing) {
        await prisma.maintenanceRule.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.maintenanceRule.create({
          data: {
            modelId: model.id,
            ...data,
          },
        });
      }
    }
  }
}

async function seedDealerRegistry() {
  for (const dealer of MCLAREN_DEALERS) {
    const website = originFromUrl(dealer.inventoryUrl) || dealer.inventoryUrl;
    const marketSource = await prisma.marketSource.upsert({
      where: { name: dealer.name },
      update: {
        type: dealer.sourceType,
        website,
        active: dealer.active,
      },
      create: {
        name: dealer.name,
        type: dealer.sourceType,
        website,
        active: dealer.active,
      },
    });

    await upsertPartnerContact({
      name: dealer.name,
      type: "DEALER",
      email: buildSalesEmailForWebsite(website),
      website,
      sourceDomain: domainFromUrl(website),
      makeSpecialization: dealer.brand,
      city: dealer.city,
      state: dealer.state,
      location: `${dealer.city}, ${dealer.state}`,
      country: "US",
      marketSourceId: marketSource.id,
      confidence: "PUBLIC_SOURCE",
      contactSource: "PUBLIC_WEBSITE",
      active: dealer.active,
    });
  }
}

async function main() {
  const make = await prisma.make.upsert({
    where: { slug: mclarenCatalog.make.slug },
    update: { name: mclarenCatalog.make.name },
    create: mclarenCatalog.make,
  });

  for (const model of mclarenCatalog.models) {
    await seedCatalogModel(make.id, model);
  }

  await seedMaintenance(make.id);
  await seedDealerRegistry();

  const [modelCount, dealerCount] = await Promise.all([
    prisma.model.count({ where: { makeId: make.id } }),
    prisma.partnerContact.count({ where: { type: "DEALER", makeSpecialization: "McLaren" } }),
  ]);

  console.log(`Seeded McLaren catalog: ${modelCount} models`);
  console.log(`Seeded McLaren dealer contacts: ${dealerCount}`);
}

function formatYears(model: CatalogModel) {
  if (!model.productionStartYear) return null;
  return model.productionEndYear
    ? `${model.productionStartYear} - ${model.productionEndYear}`
    : `${model.productionStartYear} - present`;
}

function originFromUrl(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

main()
  .catch((error) => {
    console.error("McLaren seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
