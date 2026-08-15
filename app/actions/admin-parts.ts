"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { assertAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { toPartSlug } from "@/lib/parts/slug";
import {
  addPartBrandInputSchema,
  addPartCategoryInputSchema,
  addPerformancePartInputSchema,
  upsertPreferredPartBrandInputSchema,
  updateAffiliatePartnerInputSchema,
  updatePerformancePartAffiliateInputSchema,
} from "@/lib/validation/admin-parts-inputs";
import { validationMessage } from "@/lib/validation/common-inputs";
import { buildPreferredBrandScopeKey } from "@/lib/parts/ecosystem-config";

type AddPartCategoryInput = {
  name: string;
  description?: string | null;
};

type AddPartBrandInput = {
  name: string;
  websiteUrl?: string | null;
  country?: string | null;
  brandType?: string | null;
  description?: string | null;
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

type UpdatePerformancePartAffiliateInput = {
  partId: string;
  affiliatePartnerId?: string | null;
  affiliateUrl?: string | null;
  trackingStatus: string;
  commissionRateBps?: number | null;
};

type UpdateAffiliatePartnerInput = {
  partnerId: string;
  status: string;
  active: boolean;
  network?: string | null;
  websiteUrl?: string | null;
  commissionLabel?: string | null;
  trackingTemplate?: string | null;
  disclosure?: string | null;
};

const partStatuses = new Set(["DRAFT", "MANUAL_REVIEW", "ACTIVE", "INACTIVE"]);
const confidenceStatuses = new Set(["MANUAL_REVIEW", "SOURCE_VERIFIED", "LOW_CONFIDENCE"]);
const installComplexities = new Set(["DIY", "SHOP_RECOMMENDED", "PRO_ONLY"]);
const trackingStatuses = new Set(["NOT_CONFIGURED", "CONFIGURED", "DISABLED", "NEEDS_REVIEW"]);
const affiliatePartnerStatuses = new Set(["CANDIDATE", "APPROVED", "ACTIVE", "INACTIVE", "REJECTED"]);
const activeAffiliatePartnerStatuses = new Set(["APPROVED", "ACTIVE"]);

export async function addPartCategoryAction(input: AddPartCategoryInput) {
  try {
    await assertAdmin();
    const parsed = addPartCategoryInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    const { name, description } = parsed.data;

    const category = await prisma.partCategory.upsert({
      where: { slug: toPartSlug(name) },
      update: {
        name,
        description,
        active: true,
      },
      create: {
        name,
        slug: toPartSlug(name),
        description,
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
    const parsed = addPartBrandInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    const { name, websiteUrl, country, brandType, description } = parsed.data;

    const brand = await prisma.partBrand.upsert({
      where: { slug: toPartSlug(name) },
      update: {
        name,
        websiteUrl,
        country,
        brandType,
        description,
        active: true,
      },
      create: {
        name,
        slug: toPartSlug(name),
        websiteUrl,
        country,
        brandType,
        description,
        active: true,
      },
    });

    revalidateParts();
    return { success: true, message: `Saved ${brand.name}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to save brand." };
  }
}

export async function upsertPreferredPartBrandAction(input: unknown) {
  try {
    await assertAdmin();
    const parsed = upsertPreferredPartBrandInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    const data = parsed.data;
    const [make, brand, category, component, provider] = await Promise.all([
      prisma.make.findUnique({ where: { id: data.vehicleMakeId }, select: { id: true, slug: true } }),
      prisma.partBrand.findUnique({ where: { id: data.partBrandId }, select: { id: true, slug: true } }),
      data.componentCategoryId
        ? prisma.partCategory.findUnique({ where: { id: data.componentCategoryId }, select: { id: true, slug: true } })
        : null,
      data.componentTypeId
        ? prisma.partComponentType.findUnique({ where: { id: data.componentTypeId }, select: { id: true, slug: true, categoryId: true } })
        : null,
      data.offerProviderId
        ? prisma.partOfferProvider.findUnique({ where: { id: data.offerProviderId }, select: { id: true, active: true } })
        : null,
    ]);
    if (!make || !brand) return { success: false, message: "Choose a valid vehicle make and part brand." };
    if (data.componentCategoryId && !category) return { success: false, message: "Choose a valid component category." };
    if (data.componentTypeId && !component) return { success: false, message: "Choose a valid component type." };
    if (component && category && component.categoryId !== category.id) {
      return { success: false, message: "Component type does not belong to the selected category." };
    }
    if (data.offerProviderId && !provider) return { success: false, message: "Choose a valid offer provider." };
    if (data.affiliateEnabled && !["APPROVED", "ACTIVE"].includes(data.affiliateStatus)) {
      return { success: false, message: "Affiliate mapping must be approved or active before it can be enabled." };
    }
    if (data.affiliateEnabled && (!provider || !provider.active)) {
      return { success: false, message: "Affiliate mapping requires an active offer provider." };
    }

    const scopeKey = buildPreferredBrandScopeKey({
      makeSlug: make.slug,
      brandSlug: brand.slug,
      categorySlug: category?.slug,
      componentSlug: component?.slug,
    });
    await prisma.preferredPartBrand.upsert({
      where: { scopeKey },
      update: data,
      create: { ...data, scopeKey },
    });
    revalidateParts();
    return { success: true, message: "Preferred-brand mapping saved." };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to save preferred-brand mapping." };
  }
}

export async function addPerformancePartAction(input: AddPerformancePartInput) {
  try {
    await assertAdmin();
    const parsed = addPerformancePartInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    input = parsed.data;
    const name = input.name;

    const [category, brand, make, model] = await Promise.all([
      prisma.partCategory.findUnique({ where: { id: input.categoryId } }),
      prisma.partBrand.findUnique({ where: { id: input.brandId } }),
      input.makeId ? prisma.make.findUnique({ where: { id: input.makeId }, select: { id: true } }) : null,
      input.modelId ? prisma.model.findUnique({ where: { id: input.modelId }, select: { id: true, makeId: true } }) : null,
    ]);

    if (!category) {
      return { success: false, message: "Choose a valid part category." };
    }

    if (!brand) {
      return { success: false, message: "Choose a valid part brand." };
    }

    if (input.makeId && !make) {
      return { success: false, message: "Choose a valid compatible make." };
    }

    if (input.modelId && !model) {
      return { success: false, message: "Choose a valid compatible model." };
    }

    if (model && input.makeId && model.makeId !== input.makeId) {
      return { success: false, message: "Compatible model does not belong to the selected make." };
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

export async function updatePerformancePartAffiliateAction(input: UpdatePerformancePartAffiliateInput) {
  try {
    await assertAdmin();
    const parsed = updatePerformancePartAffiliateInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    input = parsed.data;

    const part = await prisma.performancePart.findUnique({
      where: { id: input.partId },
      select: { id: true, brand: { select: { slug: true } }, slug: true },
    });
    if (!part) {
      return { success: false, message: "Choose a valid performance part." };
    }

    const trackingStatus = normalizeEnum(input.trackingStatus, trackingStatuses, "NOT_CONFIGURED");
    const affiliatePartnerId = cleanText(input.affiliatePartnerId);
    const affiliateUrl = cleanUrl(input.affiliateUrl);
    const commissionRateBps = cleanBasisPoints(input.commissionRateBps);

    if (trackingStatus === "CONFIGURED") {
      if (!affiliatePartnerId) {
        return { success: false, message: "Choose an affiliate partner before configuring tracking." };
      }
      if (!affiliateUrl) {
        return { success: false, message: "Affiliate URL is required before configuring tracking." };
      }
    }

    if (affiliatePartnerId) {
      const partner = await prisma.affiliatePartner.findUnique({
        where: { id: affiliatePartnerId },
        select: { id: true },
      });
      if (!partner) {
        return { success: false, message: "Choose a valid affiliate partner." };
      }
    }

    await prisma.performancePart.update({
      where: { id: part.id },
      data: {
        affiliatePartnerId,
        affiliateUrl,
        commissionRateBps,
        trackingStatus,
        lastCheckedAt: trackingStatus === "CONFIGURED" ? new Date() : null,
      },
    });

    revalidateParts();
    revalidatePath(`/parts/${part.brand.slug}/${part.slug}`);
    return { success: true, message: "Affiliate tracking updated." };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to update affiliate tracking." };
  }
}

export async function updateAffiliatePartnerAction(input: UpdateAffiliatePartnerInput) {
  try {
    await assertAdmin();
    const parsed = updateAffiliatePartnerInputSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    input = parsed.data;

    const partner = await prisma.affiliatePartner.findUnique({
      where: { id: input.partnerId },
      select: { id: true, name: true },
    });
    if (!partner) {
      return { success: false, message: "Choose a valid affiliate partner." };
    }

    const status = normalizeEnum(input.status, affiliatePartnerStatuses, "CANDIDATE");
    if (input.active && !activeAffiliatePartnerStatuses.has(status)) {
      return { success: false, message: "Partner must be Approved or Active before it can be enabled." };
    }

    await prisma.affiliatePartner.update({
      where: { id: partner.id },
      data: {
        status,
        active: input.active,
        network: cleanText(input.network),
        websiteUrl: cleanUrl(input.websiteUrl),
        commissionLabel: cleanText(input.commissionLabel),
        trackingTemplate: cleanText(input.trackingTemplate),
        disclosure: cleanText(input.disclosure),
      },
    });

    revalidateParts();
    return { success: true, message: `Updated ${partner.name}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to update affiliate partner." };
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

function cleanBasisPoints(value?: number | null) {
  const cleaned = cleanNumber(value);
  if (cleaned === null) return null;
  if (cleaned < 0 || cleaned > 10000) {
    throw new Error("Commission rate must be between 0 and 10000 basis points.");
  }
  return Math.round(cleaned);
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
  revalidateTag("parts-catalog", "max");
  revalidatePath("/parts");
  revalidatePath("/admin/parts");
  revalidatePath("/admin/overview");
}
