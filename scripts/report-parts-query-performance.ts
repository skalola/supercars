import { performance } from "node:perf_hooks";
import { prisma, prismaQueryMetrics } from "../lib/prisma";
import {
  getFerrariComponentOffers,
  getFerrariComponentModels,
  getFerrariModelComponentCategories,
  getFerrariModelComponents,
} from "../lib/parts/ferrari-component-service";
import { getPublicPartsStoreShell } from "../lib/parts/storefront";

async function measure(name: string, operation: () => Promise<unknown>) {
  const before = prismaQueryMetrics.count;
  const startedAt = performance.now();
  const result = await operation();
  const elapsedMs = performance.now() - startedAt;
  return {
    flow: name,
    databaseQueries: prismaQueryMetrics.count - before,
    recordsReturnedToCaller: countResponseRecords(result),
    elapsedMs: Number(elapsedMs.toFixed(2)),
  };
}

async function main() {
  if (process.env.PARTS_QUERY_REPORT !== "1") {
    throw new Error("Run through npm run report:parts-queries so per-process Prisma query reporting is enabled.");
  }

  const flows = [];
  flows.push(await measure("Parts homepage shell", () => getPublicPartsStoreShell()));
  flows.push(await measure("Ferrari model list", () => getFerrariComponentModels()));
  flows.push(await measure("Ferrari 458 category list", () => getFerrariModelComponentCategories("458-italia")));
  flows.push(await measure("Ferrari 458 Brakes components", () => getFerrariModelComponents("458-italia", "brakes")));
  flows.push(await measure("Ferrari 458 Front Brake Pads cached offers", () => getFerrariComponentOffers({
    modelSlug: "458-italia",
    categorySlug: "brakes",
    componentSlug: "front-brake-pads",
    year: 2013,
    cacheOnly: true,
  })));
  flows.push(await measure("Garage to Ferrari Parts", async () => {
    await Promise.all([
      getPublicPartsStoreShell(),
      getFerrariModelComponentCategories("458-italia"),
    ]);
  }));
  flows.push(await measure("Maintenance to Ferrari component offers", async () => {
    await getFerrariModelComponents("458-italia", "maintenance-service");
    await getFerrariComponentOffers({
      modelSlug: "458-italia",
      categorySlug: "maintenance-service",
      componentSlug: "oil-filter",
      year: 2013,
      cacheOnly: true,
    });
  }));

  console.log(JSON.stringify({
    methodology: "Database queries are exact per-process Prisma query events around uncached service calls. Records count the bounded response objects returned to the caller. Storefront HTTP caching can reduce repeated requests to zero database queries.",
    flows,
  }, null, 2));
}

function countResponseRecords(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return value == null ? 0 : 1;
  const object = value as Record<string, unknown>;
  const primaryCollection = ["offers", "models", "components", "categories"]
    .map((key) => object[key])
    .find(Array.isArray);
  return primaryCollection ? primaryCollection.length : 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
