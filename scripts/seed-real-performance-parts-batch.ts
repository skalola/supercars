import { PrismaClient } from "@prisma/client";
import { toPartSlug } from "@/lib/parts/slug";

const prisma = new PrismaClient();

type SourcePartSeed = {
  name: string;
  brandSlug: string;
  categorySlug: string;
  sourceName: string;
  sourceUrl: string;
  partNumber?: string;
  description: string;
  status?: "ACTIVE" | "MANUAL_REVIEW";
  estimatedHpGain?: number;
  gainBasis?: string;
  installComplexity?: "DIY" | "SHOP_RECOMMENDED" | "PRO_ONLY";
  compatibility: Array<{
    makeSlug: string;
    modelSlug?: string;
    yearStart?: number;
    yearEnd?: number;
    trim?: string;
    engine?: string;
    notes?: string;
  }>;
};

const REAL_PART_BATCH: SourcePartSeed[] = [
  {
    name: "Lamborghini Huracan Intake System",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/lamborghini-huracan/",
    partNumber: "EVE-HCN-CF-INT",
    description: "Carbon intake system for Lamborghini Huracan V10 models with sealed airflow housings and tune-aware MAF behavior.",
    status: "ACTIVE",
    estimatedHpGain: 12,
    gainBasis: "Source states 12-15 hp gain; stored conservatively at the low end.",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "lamborghini", modelSlug: "huracan", yearStart: 2014, trim: "V10" },
      { makeSlug: "lamborghini", modelSlug: "hurac-n-lp-610-4", yearStart: 2014, trim: "LP 610-4" },
    ],
  },
  {
    name: "Slip-On Line Titanium Exhaust - Huracan",
    brandSlug: "akrapovic",
    categorySlug: "exhaust",
    sourceName: "Akrapovic",
    sourceUrl: "https://www.akrapovic.com/en/car/product/15981?brandId=24&modelId=861&yearId=4564",
    partNumber: "MTP-LA/TI/2",
    description: "Titanium slip-on exhaust system for Lamborghini Huracan fitments published by Akrapovic.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "lamborghini", modelSlug: "huracan", yearStart: 2014, trim: "LP 580-2 / LP 610-4" },
      { makeSlug: "lamborghini", modelSlug: "hurac-n-lp-610-4", yearStart: 2014, trim: "LP 610-4" },
    ],
  },
  {
    name: "Slip-On Line Titanium Exhaust - Aventador",
    brandSlug: "akrapovic",
    categorySlug: "exhaust",
    sourceName: "Akrapovic",
    sourceUrl: "https://www.akrapovic.com/en/car/product/15512?brandId=24&modelId=694&yearId=4603",
    description: "Titanium slip-on exhaust system for Lamborghini Aventador LP 700-4 applications.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "lamborghini", modelSlug: "aventador", yearStart: 2011, trim: "LP 700-4" },
      { makeSlug: "lamborghini", modelSlug: "aventador-lp-700-4", yearStart: 2011 },
    ],
  },
  {
    name: "Ferrari F12 Carbon Intake System",
    brandSlug: "eventuri",
    categorySlug: "intake",
    sourceName: "Eventuri",
    sourceUrl: "https://www.eventuri.net/product/ferrari-f12-berlinetta/",
    partNumber: "EVE-F12-CF-INT",
    description: "Carbon intake system for Ferrari F12 Berlinetta with carbon airbox lids and high-flow panel filters.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "ferrari", modelSlug: "f12berlinetta", yearStart: 2012, yearEnd: 2017 },
    ],
  },
  {
    name: "Ferrari F12/812SF/812GTS Valved Exhaust",
    brandSlug: "capristo",
    categorySlug: "exhaust",
    sourceName: "Capristo Exhaust",
    sourceUrl: "https://capristoexhaust.com/collections/ferrari-f12",
    description: "Valved exhaust listing from Capristo for Ferrari F12 and 812-family applications.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "ferrari", modelSlug: "f12berlinetta", yearStart: 2012, yearEnd: 2017 },
      { makeSlug: "ferrari", modelSlug: "812-superfast", yearStart: 2017, trim: "812 Superfast / GTS" },
    ],
  },
  {
    name: "GR Supra Super Turbo Muffler Urban Matte Edition",
    brandSlug: "hks",
    categorySlug: "exhaust",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/pickup-car/gr_supra/index.html",
    partNumber: "31029-AT013",
    description: "HKS Super Turbo Muffler Urban Matte Edition for GR Supra RZ 3.0-liter B58 manual fitment.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "toyota", modelSlug: "gr-supra-rz", yearStart: 2020, trim: "RZ 6MT", engine: "B58" },
    ],
  },
  {
    name: "GR Supra Dry Carbon Racing Suction",
    brandSlug: "hks",
    categorySlug: "intake",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/intake/db/21926",
    partNumber: "70028-AT001",
    description: "Dry carbon racing suction intake pipe for Toyota GR Supra 3.0-liter B58 applications.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "toyota", modelSlug: "gr-supra-rz", yearStart: 2020, engine: "B58" },
    ],
  },
  {
    name: "GR Supra Power Editor Vehicle Specific Kit",
    brandSlug: "hks",
    categorySlug: "ecu-tuning",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/electronics/db/29932",
    partNumber: "42018-AT016",
    description: "Plug-in boost control and calibration device for Toyota GR Supra 3.0-liter B58 fitments.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "toyota", modelSlug: "gr-supra-rz", yearStart: 2020, engine: "B58" },
    ],
  },
  {
    name: "GT800 Full Turbine Kit",
    brandSlug: "hks",
    categorySlug: "forced-induction",
    sourceName: "HKS",
    sourceUrl: "https://www.hks-power.co.jp/en/product_db/turbo/db/13909",
    partNumber: "11003-AN012",
    description: "HKS GT800 full turbine kit for R35 GT-R applications using the VR38DETT platform.",
    status: "ACTIVE",
    installComplexity: "PRO_ONLY",
    compatibility: [
      { makeSlug: "nissan", modelSlug: "gt-r", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
      { makeSlug: "nissan", modelSlug: "gt-r-nismo", yearStart: 2008, trim: "R35", engine: "VR38DETT" },
    ],
  },
  {
    name: "Street Advance Z Coilover Kit - Acura RSX",
    brandSlug: "tein",
    categorySlug: "suspension",
    sourceName: "TEIN USA",
    sourceUrl: "https://www.tein.com/srch/us_search.php?carmodel=&item=STREETADVANCEZ&maker=ACURA&modelyear=",
    description: "TEIN Street Advance Z coilover kit application for Acura RSX model years.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "acura", modelSlug: "rsx", yearStart: 2002, yearEnd: 2006 },
      { makeSlug: "acura", modelSlug: "rsx-type-s", yearStart: 2002, yearEnd: 2006 },
    ],
  },
  {
    name: "Flex Z Coilover Kit - Acura RSX",
    brandSlug: "tein",
    categorySlug: "suspension",
    sourceName: "TEIN USA",
    sourceUrl: "https://www.tein.com/srch/us_search.php?carmodel=RSX&genuine=0&item=FLEXZ&maker=ACURA&modelyear=2005-2006",
    description: "TEIN Flex Z coilover kit application for late Acura RSX fitments.",
    status: "ACTIVE",
    installComplexity: "SHOP_RECOMMENDED",
    compatibility: [
      { makeSlug: "acura", modelSlug: "rsx", yearStart: 2005, yearEnd: 2006 },
      { makeSlug: "acura", modelSlug: "rsx-type-s", yearStart: 2005, yearEnd: 2006 },
    ],
  },
];

async function main() {
  const createdOrUpdated: string[] = [];
  const missingCompatibility: string[] = [];

  for (const seed of REAL_PART_BATCH) {
    const [category, brand] = await Promise.all([
      prisma.partCategory.findUnique({ where: { slug: seed.categorySlug } }),
      prisma.partBrand.findUnique({ where: { slug: seed.brandSlug } }),
    ]);

    if (!category) throw new Error(`Missing part category: ${seed.categorySlug}`);
    if (!brand) throw new Error(`Missing part brand: ${seed.brandSlug}`);

    const part = await prisma.performancePart.upsert({
      where: {
        brandId_slug: {
          brandId: brand.id,
          slug: toPartSlug(seed.name),
        },
      },
      update: {
        categoryId: category.id,
        name: seed.name,
        partNumber: seed.partNumber ?? null,
        description: seed.description,
        sourceUrl: seed.sourceUrl,
        sourceName: seed.sourceName,
        sourceConfidence: "SOURCE_VERIFIED",
        status: seed.status ?? "ACTIVE",
        estimatedHpGain: seed.estimatedHpGain ?? null,
        gainBasis: seed.gainBasis ?? null,
        installComplexity: seed.installComplexity ?? "SHOP_RECOMMENDED",
        trackingStatus: "NOT_CONFIGURED",
      },
      create: {
        categoryId: category.id,
        brandId: brand.id,
        name: seed.name,
        slug: toPartSlug(seed.name),
        partNumber: seed.partNumber ?? null,
        description: seed.description,
        sourceUrl: seed.sourceUrl,
        sourceName: seed.sourceName,
        sourceConfidence: "SOURCE_VERIFIED",
        status: seed.status ?? "ACTIVE",
        estimatedHpGain: seed.estimatedHpGain ?? null,
        gainBasis: seed.gainBasis ?? null,
        installComplexity: seed.installComplexity ?? "SHOP_RECOMMENDED",
        trackingStatus: "NOT_CONFIGURED",
      },
    });

    for (const fitment of seed.compatibility) {
      const make = await prisma.make.findUnique({ where: { slug: fitment.makeSlug } });
      if (!make) {
        missingCompatibility.push(`${seed.name}: missing make ${fitment.makeSlug}`);
        continue;
      }

      const model = fitment.modelSlug
        ? await prisma.model.findUnique({
            where: {
              makeId_slug: {
                makeId: make.id,
                slug: fitment.modelSlug,
              },
            },
          })
        : null;

      if (fitment.modelSlug && !model) {
        missingCompatibility.push(`${seed.name}: missing model ${fitment.makeSlug}/${fitment.modelSlug}`);
        continue;
      }

      const compatibilityScope = {
        partId: part.id,
        makeId: make.id,
        modelId: model?.id ?? null,
        yearStart: fitment.yearStart ?? null,
        yearEnd: fitment.yearEnd ?? null,
        trim: fitment.trim ?? null,
        engine: fitment.engine ?? null,
      };

      const existingCompatibility = await prisma.partCompatibility.findFirst({
        where: compatibilityScope,
        select: { id: true },
      });

      if (existingCompatibility) {
        await prisma.partCompatibility.update({
          where: { id: existingCompatibility.id },
          data: {
            notes: fitment.notes ?? null,
            confidence: "SOURCE_VERIFIED",
          },
        });
      } else {
        await prisma.partCompatibility.create({
          data: {
            ...compatibilityScope,
            notes: fitment.notes ?? null,
            confidence: "SOURCE_VERIFIED",
          },
        });
      }
    }

    createdOrUpdated.push(`${brand.name} ${seed.name}`);
  }

  const [activeParts, sourceVerifiedParts, compatibilityRows] = await Promise.all([
    prisma.performancePart.count({ where: { status: "ACTIVE" } }),
    prisma.performancePart.count({ where: { sourceConfidence: "SOURCE_VERIFIED" } }),
    prisma.partCompatibility.count({ where: { confidence: "SOURCE_VERIFIED" } }),
  ]);

  console.log(JSON.stringify({
    imported: createdOrUpdated.length,
    activeParts,
    sourceVerifiedParts,
    sourceVerifiedCompatibilityRows: compatibilityRows,
    missingCompatibility,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
