import { PrismaClient } from "@prisma/client";
import { evaluateModelImageIdentity } from "@/lib/model-catalog/model-image-identity";
import { validateVehicleImageContentFromUrl } from "@/lib/data-quality/vehicle-image-content-validator";
import { getBatchLimit, isExecuteMode, logScriptMode } from "./lib/script-guards";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const execute = isExecuteMode();
  const limit = getBatchLimit({ defaultLimit: 2_000, maxLimit: 10_000 });
  const makeArg = args.find((arg) => arg.startsWith("--make="));
  const modelArg = args.find((arg) => arg.startsWith("--model="));
  const make = makeArg?.split("=").slice(1).join("=").trim() || null;
  const modelSlug = modelArg?.split("=").slice(1).join("=").trim() || null;
  logScriptMode("audit-model-image-identity", execute, limit);

  const models = await prisma.model.findMany({
    where: {
      ...(make ? { make: { name: { equals: make, mode: "insensitive" } } } : {}),
      ...(modelSlug ? { slug: modelSlug } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      metadataStatus: true,
      make: { select: { name: true, models: { select: { name: true } } } },
      images: {
        select: {
          id: true,
          url: true,
          source: true,
          sourceName: true,
          sourceUrl: true,
          attribution: true,
          attributionUrl: true,
          license: true,
          confidence: true,
          reviewStatus: true,
          type: true,
        },
        orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ make: { name: "asc" } }, { name: "asc" }],
    take: limit,
  });

  let rejectedCount = 0;
  let promotedCount = 0;
  let reviewedCount = 0;

  for (const model of models) {
    const siblingModelNames = model.make.models.map((sibling) => sibling.name);
    const decisions = model.images.map((image) => ({
      image,
      result: evaluateModelImageIdentity({
        makeName: model.make.name,
        modelName: model.name,
        siblingModelNames,
        image,
      }),
    }));
    const rejectedIds = decisions
      .filter(({ image, result }) =>
        result.status === "REJECTED"
        && image.reviewStatus !== "REJECTED"
        && !(image.reviewStatus === "NEEDS_REVIEW" && image.type?.toLowerCase() === "candidate"),
      )
      .map(({ image }) => image.id);

    for (const decision of decisions.filter(({ image }) => rejectedIds.includes(image.id))) {
      console.log(`[model-image-audit] REJECT ${model.make.name} ${model.name} | ${decision.result.reason}`);
    }
    rejectedCount += rejectedIds.length;

    const hasRemainingHero = decisions.some(({ image }) =>
      !rejectedIds.includes(image.id)
      && image.reviewStatus !== "REJECTED"
      && image.reviewStatus !== "NEEDS_REVIEW"
      && image.type?.toLowerCase() !== "candidate",
    );

    let promotion: (typeof decisions)[number] | null = null;
    if (!hasRemainingHero) {
      for (const decision of decisions.filter(({ image, result }) =>
        !rejectedIds.includes(image.id)
        && image.reviewStatus === "NEEDS_REVIEW"
        && result.status === "VERIFIED")) {
        const visual = await validateVehicleImageContentFromUrl(decision.image.url);
        const aspectRatio = visual.metrics?.aspectRatio || 0;
        if (visual.status === "VALID_CAR_IMAGE" && aspectRatio >= 1.15 && aspectRatio <= 2.5) {
          promotion = decision;
          break;
        }
      }
    }

    if (promotion) {
      console.log(`[model-image-audit] PROMOTE ${model.make.name} ${model.name} | ${promotion.result.reason}`);
      promotedCount += 1;
    } else if (!hasRemainingHero) {
      reviewedCount += 1;
    }

    if (!execute) continue;

    await prisma.$transaction(async (tx) => {
      if (rejectedIds.length > 0) {
        await tx.modelImage.updateMany({
          where: { id: { in: rejectedIds } },
          data: { reviewStatus: "NEEDS_REVIEW", type: "candidate" },
        });
      }

      if (promotion) {
        await tx.modelImage.update({
          where: { id: promotion.image.id },
          data: { reviewStatus: "APPROVED", type: "hero" },
        });
        if (model.metadataStatus === "NEEDS_REVIEW" || model.metadataStatus === "UNREVIEWED") {
          await tx.model.update({
            where: { id: model.id },
            data: { metadataStatus: "PARTIAL", lastMetadataAuditAt: new Date() },
          });
        }
      }
    });
  }

  console.log(`[model-image-audit] Models scanned: ${models.length}`);
  console.log(`[model-image-audit] Mismatched images ${execute ? "rejected" : "found"}: ${rejectedCount}`);
  console.log(`[model-image-audit] Exact-model candidates ${execute ? "promoted" : "eligible"}: ${promotedCount}`);
  console.log(`[model-image-audit] Models still requiring image review: ${reviewedCount}`);
}

main()
  .catch((error) => {
    console.error("[model-image-audit] Fatal error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
