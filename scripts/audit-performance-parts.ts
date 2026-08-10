import { PrismaClient } from "@prisma/client";
import { auditPerformancePartTrust } from "@/lib/parts/trust";

const prisma = new PrismaClient();

const TARGET_PERFORMANCE_MAKE_SLUGS = [
  "acura",
  "amg",
  "audi",
  "bmw",
  "chevrolet",
  "dodge",
  "ferrari",
  "honda",
  "lamborghini",
  "mazda",
  "mclaren",
  "mitsubishi",
  "nissan",
  "porsche",
  "subaru",
  "toyota",
];

async function main() {
  const [parts, targetMakes] = await Promise.all([
    prisma.performancePart.findMany({
    include: {
      brand: true,
      category: true,
      compatibility: {
        include: {
          make: true,
          model: true,
        },
        orderBy: [
          { make: { name: "asc" } },
          { model: { name: "asc" } },
        ],
      },
    },
    orderBy: [
      { brand: { name: "asc" } },
      { category: { name: "asc" } },
      { name: "asc" },
    ],
    }),
    prisma.make.findMany({
      where: { slug: { in: TARGET_PERFORMANCE_MAKE_SLUGS } },
      include: {
        models: {
          select: { id: true, name: true, slug: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const audits = parts.map((part) => ({
    part,
    audit: auditPerformancePartTrust(part),
  }));

  const missingImage = audits.filter(({ part }) => !part.imageUrl);
  const missingPrice = audits.filter(({ part }) => part.retailPriceCents === null);
  const missingGains = audits.filter(({ part }) => part.estimatedHpGain === null && part.estimatedTorqueGain === null);
  const missingSource = audits.filter(({ part }) => !part.sourceUrl);
  const unverifiedSource = audits.filter(({ part }) => part.sourceConfidence !== "SOURCE_VERIFIED");
  const missingCompatibility = audits.filter(({ part }) => part.compatibility.length === 0);
  const unscopedCompatibility = audits.filter(
    ({ part }) => part.compatibility.length > 0 && !part.compatibility.some((fitment) => fitment.makeId || fitment.modelId)
  );
  const publicReady = audits.filter(({ audit }) => audit.publicEligible);
  const needsReview = audits.filter(({ audit }) => !audit.publicEligible);

  console.log("Performance Parts Catalog Audit");
  console.log("--------------------------------");
  console.log(`Total parts: ${parts.length}`);
  console.log(`Public ready: ${publicReady.length}`);
  console.log(`Needs review: ${needsReview.length}`);
  console.log("");
  console.log("Missing data");
  console.log(`  Missing images: ${missingImage.length}`);
  console.log(`  Missing prices: ${missingPrice.length}`);
  console.log(`  Missing gain estimates: ${missingGains.length}`);
  console.log(`  Missing source URLs: ${missingSource.length}`);
  console.log(`  Unverified sources: ${unverifiedSource.length}`);
  console.log(`  Missing compatibility: ${missingCompatibility.length}`);
  console.log(`  Unscoped compatibility: ${unscopedCompatibility.length}`);

  printCoverageByMake(audits);
  printTargetModelCoverage(audits, targetMakes);
  printReviewList("Needs review", needsReview);
  printReviewList("Missing images", missingImage);
  printReviewList("Missing prices", missingPrice);
}

function printCoverageByMake(audits: Array<{
  part: {
    compatibility: Array<{
      make: { name: string } | null;
    }>;
  };
}>) {
  const coverage = new Map<string, number>();

  for (const { part } of audits) {
    const makeNames = new Set(part.compatibility.map((fitment) => fitment.make?.name ?? "Unscoped"));
    for (const makeName of makeNames) {
      coverage.set(makeName, (coverage.get(makeName) ?? 0) + 1);
    }
  }

  console.log("");
  console.log("Coverage by make");
  for (const [makeName, count] of Array.from(coverage.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${makeName}: ${count}`);
  }
}

function printTargetModelCoverage(
  audits: Array<{
    audit: { publicEligible: boolean };
    part: {
      compatibility: Array<{
        modelId: string | null;
      }>;
    };
  }>,
  targetMakes: Array<{
    name: string;
    models: Array<{
      id: string;
      name: string;
    }>;
  }>
) {
  const coveredModelIds = new Set<string>();
  for (const { audit, part } of audits) {
    if (!audit.publicEligible) continue;
    for (const fitment of part.compatibility) {
      if (fitment.modelId) coveredModelIds.add(fitment.modelId);
    }
  }

  console.log("");
  console.log("Target model coverage");
  for (const make of targetMakes) {
    const coveredModels = make.models.filter((model) => coveredModelIds.has(model.id));
    const percent = make.models.length === 0 ? 0 : Math.round((coveredModels.length / make.models.length) * 100);
    const preview = coveredModels.slice(0, 6).map((model) => model.name).join(", ");
    console.log(`  ${make.name}: ${coveredModels.length}/${make.models.length} models (${percent}%)${preview ? ` | ${preview}` : ""}`);
  }
}

function printReviewList(
  title: string,
  rows: Array<{
    part: {
      name: string;
      brand: { name: string };
      category: { name: string };
    };
    audit?: {
      issues: string[];
      warnings: string[];
    };
  }>
) {
  if (rows.length === 0) return;

  console.log("");
  console.log(`${title} (${rows.length})`);
  for (const { part, audit } of rows.slice(0, 30)) {
    const reason = audit ? [...audit.issues, ...audit.warnings].join("; ") : "";
    console.log(`  - ${part.brand.name} | ${part.category.name} | ${part.name}${reason ? ` | ${reason}` : ""}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
