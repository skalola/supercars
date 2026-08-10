"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { toPartSlug } from "@/lib/parts/slug";

type AddPartCategoryInput = {
  name: string;
  description?: string | null;
};

type AddPartBrandInput = {
  name: string;
  websiteUrl?: string | null;
  country?: string | null;
};

type AddPerformancePartInput = {
  name: string;
  categoryId: string;
  brandId: string;
  partNumber?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  status?: string | null;
  sourceConfidence?: string | null;
  retailPrice?: number | null;
  retailerName?: string | null;
  retailerSku?: string | null;
  estimatedHpGain?: number | null;
  estimatedTorqueGain?: number | null;
  gainBasis?: string | null;
  installComplexity?: string | null;
  notes?: string | null;
  makeId?: string | null;
  modelId?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  trim?: string | null;
  engine?: string | null;
};

const partStatuses = new Set(["DRAFT", "MANUAL_REVIEW", "ACTIVE", "INACTIVE"]);
const confidenceStatuses = new Set(["MANUAL_REVIEW", "SOURCE_VERIFIED", "LOW_CONFIDENCE"]);
const installComplexities = new Set(["DIY", "SHOP_RECOMMENDED", "PRO_ONLY"]);

export async function addPartCategoryAction(input: AddPartCategoryInput) {
  try {
    await assertAdmin();

    const name = input.name.trim();
    if (!name) {
      return { success: false, message: "Category name is required." };
    }

    const category = await prisma.partCategory.upsert({
      where: { slug: toPartSlug(name) },
      update: {
        name,
        description: cleanText(input.description),
        active: true,
      },
      create: {
        name,
        slug: toPartSlug(name),
        description: cleanText(input.description),
        active: true,
        displayOrder: await getNextCategoryDisplayOrder(),
      },
    });

    revalidateParts();
    return { success: true, message: `Saved ${category.name}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to save category." };
  }
}

export async function addPartBrandAction(input: AddPartBrandInput) {
  try {
    await assertAdmin();

    const name = input.name.trim();
    if (!name) {
      return { success: false, message: "Brand name is required." };
    }

    const brand = await prisma.partBrand.upsert({
      where: { slug: toPartSlug(name) },
      update: {
        name,
        websiteUrl: cleanUrl(input.websiteUrl),
        country: cleanText(input.country),
        active: true,
      },
      create: {
        name,
        slug: toPartSlug(name),
        websiteUrl: cleanUrl(input.websiteUrl),
        country: cleanText(input.country),
        active: true,
      },
    });

    revalidateParts();
    return { success: true, message: `Saved ${brand.name}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to save brand." };
  }
}

export async function addPerformancePartAction(input: AddPerformancePartInput) {
  try {
    await assertAdmin();

    const name = input.name.trim();
    if (!name) {
      return { success: false, message: "Part name is required." };
    }

    const [category, brand] = await Promise.all([
      prisma.partCategory.findUnique({ where: { id: input.categoryId } }),
      prisma.partBrand.findUnique({ where: { id: input.brandId } }),
    ]);

    if (!category) {
      return { success: false, message: "Choose a valid part category." };
    }

    if (!brand) {
      return { success: false, message: "Choose a valid part brand." };
    }

    const status = normalizeEnum(input.status, partStatuses, "MANUAL_REVIEW");
    const sourceConfidence = normalizeEnum(input.sourceConfidence, confidenceStatuses, "MANUAL_REVIEW");
    const installComplexity = input.installComplexity
      ? normalizeEnum(input.installComplexity, installComplexities, "SHOP_RECOMMENDED")
      : null;

    const part = await prisma.performancePart.upsert({
      where: {
        brandId_slug: {
          brandId: brand.id,
          slug: toPartSlug(name),
        },
      },
      update: {
        categoryId: category.id,
        name,
        partNumber: cleanText(input.partNumber),
        description: cleanText(input.description),
        imageUrl: cleanUrl(input.imageUrl),
        sourceUrl: cleanUrl(input.sourceUrl),
        sourceName: cleanText(input.sourceName),
        status,
        sourceConfidence,
        retailPriceCents: toCents(input.retailPrice),
        retailerName: cleanText(input.retailerName),
        retailerSku: cleanText(input.retailerSku),
        estimatedHpGain: cleanNumber(input.estimatedHpGain),
        estimatedTorqueGain: cleanNumber(input.estimatedTorqueGain),
        gainBasis: cleanText(input.gainBasis),
        installComplexity,
        notes: cleanText(input.notes),
      },
      create: {
        categoryId: category.id,
        brandId: brand.id,
        name,
        slug: toPartSlug(name),
        partNumber: cleanText(input.partNumber),
        description: cleanText(input.description),
        imageUrl: cleanUrl(input.imageUrl),
        sourceUrl: cleanUrl(input.sourceUrl),
        sourceName: cleanText(input.sourceName),
        status,
        sourceConfidence,
        retailPriceCents: toCents(input.retailPrice),
        retailerName: cleanText(input.retailerName),
        retailerSku: cleanText(input.retailerSku),
        estimatedHpGain: cleanNumber(input.estimatedHpGain),
        estimatedTorqueGain: cleanNumber(input.estimatedTorqueGain),
        gainBasis: cleanText(input.gainBasis),
        installComplexity,
        notes: cleanText(input.notes),
      },
    });

    const hasCompatibility =
      Boolean(input.makeId) ||
      Boolean(input.modelId) ||
      input.yearStart !== null ||
      input.yearEnd !== null ||
      Boolean(input.trim) ||
      Boolean(input.engine);

    if (hasCompatibility) {
      if (input.modelId) {
        const model = await prisma.model.findUnique({ where: { id: input.modelId }, select: { makeId: true } });
        if (!model) {
          return { success: false, message: "Choose a valid compatible model." };
        }
        if (input.makeId && model.makeId !== input.makeId) {
          return { success: false, message: "Compatible model does not belong to the selected make." };
        }
      }

      const compatibilityScope = {
        partId: part.id,
        makeId: input.makeId || null,
        modelId: input.modelId || null,
        yearStart: cleanNumber(input.yearStart),
        yearEnd: cleanNumber(input.yearEnd),
        trim: cleanText(input.trim),
        engine: cleanText(input.engine),
      };
      const existingCompatibility = await prisma.partCompatibility.findFirst({
        where: compatibilityScope,
        select: { id: true },
      });

      if (existingCompatibility) {
        await prisma.partCompatibility.update({
          where: { id: existingCompatibility.id },
          data: { confidence: "MANUAL_REVIEW" },
        });
      } else {
        await prisma.partCompatibility.create({
          data: {
            ...compatibilityScope,
            confidence: "MANUAL_REVIEW",
          },
        });
      }
    }

    revalidateParts();
    return { success: true, message: `Saved ${part.name}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to save part." };
  }
}

async function getNextCategoryDisplayOrder() {
  const latest = await prisma.partCategory.findFirst({
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  return (latest?.displayOrder ?? 0) + 10;
}

function cleanText(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function cleanUrl(value?: string | null) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned;
  return `https://${cleaned}`;
}

function cleanNumber(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number.isFinite(value) ? value : null;
}

function toCents(value?: number | null) {
  const cleaned = cleanNumber(value);
  if (cleaned === null) return null;
  return Math.round(cleaned * 100);
}

function normalizeEnum(value: string | null | undefined, allowed: Set<string>, fallback: string) {
  const normalized = value?.trim().toUpperCase();
  return normalized && allowed.has(normalized) ? normalized : fallback;
}

function revalidateParts() {
  revalidatePath("/admin/parts");
  revalidatePath("/admin/overview");
}
