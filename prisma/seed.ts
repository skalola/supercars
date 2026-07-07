import ferrariCatalog from "../data/ferrari.json";
import lamborghiniCatalog from "../data/lamborghini.json";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Catalog = {
  make: {
    name: string;
    slug: string;
  };
  models: CatalogModel[];
};

type CatalogModel = {
  name: string;
  slug: string;
  productionStartYear?: number;
  productionEndYear?: number;
  category?: string;
  bodyStyle?: string;
  productionCount?: number;
  description?: string;
  spec?: {
    engine?: string;
    displacement?: string;
    cylinders?: string;
    horsepower?: string;
    torque?: string;
    transmission?: string;
    drivetrain?: string;
    topSpeed?: string;
    zeroToSixty?: string;
    weight?: string;
  };
  images?: {
    url: string;
    source?: string;
    type?: string;
  }[];
  variants?: {
    name: string;
    slug: string;
    productionStartYear?: number;
    productionEndYear?: number;
    productionCount?: number;
    description?: string;
  }[];
};

const catalogs = [ferrariCatalog, lamborghiniCatalog] satisfies Catalog[];

function formatYears(model: CatalogModel) {
  if (!model.productionStartYear) {
    return null;
  }

  return model.productionEndYear
    ? `${model.productionStartYear} - ${model.productionEndYear}`
    : `${model.productionStartYear} - present`;
}

async function seedCatalog(catalog: Catalog) {
  const make = await prisma.make.upsert({
    where: { slug: catalog.make.slug },
    update: { name: catalog.make.name },
    create: {
      name: catalog.make.name,
      slug: catalog.make.slug,
    },
  });

  for (const catalogModel of catalog.models) {
    const model = await prisma.model.upsert({
      where: {
        makeId_slug: {
          makeId: make.id,
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
        makeId: make.id,
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
        update: {
          engine: catalogModel.spec.engine ?? null,
          displacement: catalogModel.spec.displacement ?? null,
          cylinders: catalogModel.spec.cylinders ?? null,
          horsepower: catalogModel.spec.horsepower ?? null,
          torque: catalogModel.spec.torque ?? null,
          transmission: catalogModel.spec.transmission ?? null,
          drivetrain: catalogModel.spec.drivetrain ?? null,
          topSpeed: catalogModel.spec.topSpeed ?? null,
          zeroToSixty: catalogModel.spec.zeroToSixty ?? null,
          weight: catalogModel.spec.weight ?? null,
        },
        create: {
          modelId: model.id,
          engine: catalogModel.spec.engine ?? null,
          displacement: catalogModel.spec.displacement ?? null,
          cylinders: catalogModel.spec.cylinders ?? null,
          horsepower: catalogModel.spec.horsepower ?? null,
          torque: catalogModel.spec.torque ?? null,
          transmission: catalogModel.spec.transmission ?? null,
          drivetrain: catalogModel.spec.drivetrain ?? null,
          topSpeed: catalogModel.spec.topSpeed ?? null,
          zeroToSixty: catalogModel.spec.zeroToSixty ?? null,
          weight: catalogModel.spec.weight ?? null,
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
        update: {
          name: variant.name,
          productionStartYear: variant.productionStartYear ?? null,
          productionEndYear: variant.productionEndYear ?? null,
          productionCount: variant.productionCount ?? null,
          description: variant.description ?? null,
        },
        create: {
          modelId: model.id,
          name: variant.name,
          slug: variant.slug,
          productionStartYear: variant.productionStartYear ?? null,
          productionEndYear: variant.productionEndYear ?? null,
          productionCount: variant.productionCount ?? null,
          description: variant.description ?? null,
        },
      });
    }

    for (const image of catalogModel.images ?? []) {
      await prisma.modelImage.upsert({
        where: {
          modelId_url: {
            modelId: model.id,
            url: image.url,
          },
        },
        update: {
          source: image.source ?? null,
          type: image.type ?? null,
        },
        create: {
          modelId: model.id,
          url: image.url,
          source: image.source ?? null,
          type: image.type ?? null,
        },
      });
    }
  }

  return make;
}

async function seedSampleVehicles() {
  const ferrari = await prisma.make.findUnique({
    where: { slug: "ferrari" },
  });
  const lamborghini = await prisma.make.findUnique({
    where: { slug: "lamborghini" },
  });

  const f40 =
    ferrari &&
    (await prisma.model.findUnique({
      where: {
        makeId_slug: {
          makeId: ferrari.id,
          slug: "f40",
        },
      },
    }));
  const f50 =
    ferrari &&
    (await prisma.model.findUnique({
      where: {
        makeId_slug: {
          makeId: ferrari.id,
          slug: "f50",
        },
      },
    }));
  const huracan =
    lamborghini &&
    (await prisma.model.findUnique({
      where: {
        makeId_slug: {
          makeId: lamborghini.id,
          slug: "huracan",
        },
      },
    }));

  if (f40) {
    await prisma.vehicle.upsert({
      where: { vin: "ZFFMN34A1L0081234" },
      update: {
        modelId: f40.id,
        year: 1990,
        color: "Rosso Corsa",
        mileage: 12000,
        transmission: "Manual",
        drivetrain: "RWD",
        engine: "2.9L Twin Turbo V8",
      },
      create: {
        vin: "ZFFMN34A1L0081234",
        modelId: f40.id,
        year: 1990,
        color: "Rosso Corsa",
        mileage: 12000,
        transmission: "Manual",
        drivetrain: "RWD",
        engine: "2.9L Twin Turbo V8",
      },
    });

    await prisma.vehicle.upsert({
      where: { vin: "ZFFMN34A1L0085678" },
      update: {
        modelId: f40.id,
        year: 1991,
        color: "Rosso Corsa",
        mileage: 9800,
        transmission: "Manual",
        drivetrain: "RWD",
        engine: "2.9L Twin Turbo V8",
      },
      create: {
        vin: "ZFFMN34A1L0085678",
        modelId: f40.id,
        year: 1991,
        color: "Rosso Corsa",
        mileage: 9800,
        transmission: "Manual",
        drivetrain: "RWD",
        engine: "2.9L Twin Turbo V8",
      },
    });
  }

  if (f50) {
    await prisma.vehicle.upsert({
      where: { vin: "ZFFZS49A000012345" },
      update: {
        modelId: f50.id,
        year: 1995,
        color: "Red",
        mileage: 4500,
        transmission: "Manual",
        drivetrain: "RWD",
        engine: "4.7L V12",
      },
      create: {
        vin: "ZFFZS49A000012345",
        modelId: f50.id,
        year: 1995,
        color: "Red",
        mileage: 4500,
        transmission: "Manual",
        drivetrain: "RWD",
        engine: "4.7L V12",
      },
    });
  }

  if (huracan) {
    await prisma.vehicle.upsert({
      where: { vin: "ZHWUR1ZF0FLA12345" },
      update: {
        modelId: huracan.id,
        year: 2016,
        color: "Matte Black",
        mileage: 15000,
        transmission: "Dual-Clutch",
        drivetrain: "AWD",
        engine: "5.2L V10",
      },
      create: {
        vin: "ZHWUR1ZF0FLA12345",
        modelId: huracan.id,
        year: 2016,
        color: "Matte Black",
        mileage: 15000,
        transmission: "Dual-Clutch",
        drivetrain: "AWD",
        engine: "5.2L V10",
      },
    });
  }
}

async function removeObsoleteSeedDuplicates() {
  const lamborghini = await prisma.make.findUnique({
    where: { slug: "lamborghini" },
  });

  if (!lamborghini) {
    return;
  }

  const duplicateCountach = await prisma.model.findUnique({
    where: {
      makeId_slug: {
        makeId: lamborghini.id,
        slug: "countach-lpi-800-4",
      },
    },
    include: {
      vehicles: {
        select: { id: true },
      },
    },
  });

  if (duplicateCountach && duplicateCountach.vehicles.length === 0) {
    await prisma.modelSpec.deleteMany({
      where: { modelId: duplicateCountach.id },
    });
    await prisma.modelImage.deleteMany({
      where: { modelId: duplicateCountach.id },
    });
    await prisma.modelVariant.deleteMany({
      where: { modelId: duplicateCountach.id },
    });
    await prisma.model.delete({
      where: { id: duplicateCountach.id },
    });
  }
}

async function main() {
  for (const catalog of catalogs) {
    await seedCatalog(catalog);
  }

  await removeObsoleteSeedDuplicates();
  await seedSampleVehicles();

  const [ferrariModels, lamborghiniModels] = await Promise.all([
    prisma.model.count({
      where: {
        make: {
          slug: "ferrari",
        },
      },
    }),
    prisma.model.count({
      where: {
        make: {
          slug: "lamborghini",
        },
      },
    }),
  ]);

  console.log("Seed complete:", {
    ferrariModels,
    lamborghiniModels,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
