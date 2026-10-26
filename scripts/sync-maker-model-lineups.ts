import { prisma } from "@/lib/prisma";
import { MAKER_SITE_CONFIGS } from "@/lib/maker-sites/config";
import { fetchNhtsaCarLineup } from "@/lib/maker-sites/sources/nhtsa";

type Options = {
  apply: boolean;
  makeSlug: string | null;
  startYear: number;
  endYear: number;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const makers = MAKER_SITE_CONFIGS.filter((maker) => !options.makeSlug || maker.slug === options.makeSlug);
  if (makers.length === 0) throw new Error(`Unknown maker slug: ${options.makeSlug}`);

  let discovered = 0;
  let creates = 0;
  let updates = 0;

  for (const maker of makers) {
    const make = await prisma.make.findUnique({
      where: { slug: maker.slug },
      select: {
        id: true,
        name: true,
        models: {
          select: { id: true, slug: true, productionStartYear: true, productionEndYear: true },
        },
      },
    });
    if (!make) {
      console.warn(`[maker-lineup] Skipping missing Make row: ${maker.displayName}`);
      continue;
    }

    const lineup = await fetchNhtsaCarLineup(make.name, options.startYear, options.endYear);
    const existingBySlug = new Map(make.models.map((model) => [model.slug, model]));
    const newRows = lineup.filter((entry) => !existingBySlug.has(slugify(entry.name)));
    const changedRows = lineup.filter((entry) => {
      const existing = existingBySlug.get(slugify(entry.name));
      if (!existing) return false;
      return (
        existing.productionStartYear === null ||
        entry.productionStartYear < existing.productionStartYear ||
        existing.productionEndYear === null ||
        entry.productionEndYear > existing.productionEndYear
      );
    });

    discovered += lineup.length;
    creates += newRows.length;
    updates += changedRows.length;
    console.log(
      `[maker-lineup] ${make.name}: ${lineup.length} source models, ${newRows.length} new, ${changedRows.length} year-range updates.`,
    );

    if (!options.apply) continue;

    await prisma.$transaction(async (tx) => {
      if (newRows.length > 0) {
        await tx.model.createMany({
          data: newRows.map((entry) => ({
            makeId: make.id,
            name: entry.name,
            slug: slugify(entry.name),
            years: formatYears(entry.productionStartYear, entry.productionEndYear),
            productionStartYear: entry.productionStartYear,
            productionEndYear: entry.productionEndYear,
            metadataStatus: "PARTIAL",
            metadataConfidence: 0.9,
            metadataSource: "NHTSA vPIC",
            metadataSourceUrl: entry.sourceUrl,
            lastMetadataAuditAt: new Date(),
          })),
          skipDuplicates: true,
        });
      }

      for (const entry of changedRows) {
        const existing = existingBySlug.get(slugify(entry.name));
        if (!existing) continue;
        const productionStartYear = Math.min(existing.productionStartYear ?? entry.productionStartYear, entry.productionStartYear);
        const productionEndYear = Math.max(existing.productionEndYear ?? entry.productionEndYear, entry.productionEndYear);
        await tx.model.update({
          where: { id: existing.id },
          data: {
            years: formatYears(productionStartYear, productionEndYear),
            productionStartYear,
            productionEndYear,
          },
        });
      }
    });
  }

  console.log(`[maker-lineup] Mode: ${options.apply ? "APPLY" : "AUDIT ONLY"}`);
  console.log(`[maker-lineup] Discovered: ${discovered}; new: ${creates}; year updates: ${updates}.`);
}

function parseOptions(args: string[]): Options {
  const currentYear = new Date().getUTCFullYear();
  const makeArg = args.find((arg) => arg.startsWith("--make="));
  const startArg = args.find((arg) => arg.startsWith("--start-year="));
  const endArg = args.find((arg) => arg.startsWith("--end-year="));
  const startYear = Number(startArg?.split("=")[1] || 1981);
  const endYear = Number(endArg?.split("=")[1] || currentYear + 1);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < 1900 || endYear < startYear) {
    throw new Error("Invalid year range.");
  }
  return {
    apply: args.includes("--apply"),
    makeSlug: makeArg?.split("=")[1] || null,
    startYear,
    endYear,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatYears(startYear: number, endYear: number) {
  return startYear === endYear ? String(startYear) : `${startYear}-${endYear}`;
}

main()
  .catch((error) => {
    console.error("[maker-lineup] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
