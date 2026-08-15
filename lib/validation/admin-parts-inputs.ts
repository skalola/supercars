import { z } from "zod";
import { databaseIdSchema, optionalText } from "@/lib/validation/common-inputs";
import {
  PARTNER_AFFILIATE_STATUSES,
  PART_BRAND_TYPES,
  PREFERRED_BRAND_RELATIONSHIPS,
} from "@/lib/parts/ecosystem-config";

const nullableIdSchema = databaseIdSchema.nullish().transform((value) => value || null);
const nullableNumber = (schema: z.ZodNumber) => schema.nullish().transform((value) => value ?? null);

const optionalWebUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .nullish()
  .transform((value) => {
    if (!value) return null;
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  })
  .pipe(z.string().url().refine((value) => /^https?:\/\//i.test(value)).nullable());

export const addPartCategoryInputSchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(100),
  description: optionalText(1_000),
}).strict();

export const addPartBrandInputSchema = z.object({
  name: z.string().trim().min(1, "Brand name is required.").max(120),
  websiteUrl: optionalWebUrlSchema,
  country: optionalText(80),
  brandType: z.enum(PART_BRAND_TYPES).nullish().transform((value) => value || "OTHER"),
  description: optionalText(2_000),
}).strict();

export const upsertPreferredPartBrandInputSchema = z.object({
  vehicleMakeId: databaseIdSchema,
  partBrandId: databaseIdSchema,
  componentCategoryId: nullableIdSchema,
  componentTypeId: nullableIdSchema,
  offerProviderId: nullableIdSchema,
  relationshipType: z.enum(PREFERRED_BRAND_RELATIONSHIPS),
  priority: z.number().int().min(1).max(1_000),
  officialCatalogUrl: optionalWebUrlSchema,
  affiliateEnabled: z.boolean(),
  affiliateStatus: z.enum(PARTNER_AFFILIATE_STATUSES),
  trackingConfigName: optionalText(160),
  active: z.boolean(),
}).strict();

export const addPerformancePartInputSchema = z
  .object({
    name: z.string().trim().min(1, "Part name is required.").max(180),
    categoryId: databaseIdSchema,
    brandId: databaseIdSchema,
    partNumber: optionalText(120),
    description: optionalText(4_000),
    imageUrl: optionalWebUrlSchema,
    sourceUrl: optionalWebUrlSchema,
    sourceName: optionalText(160),
    status: z.enum(["DRAFT", "MANUAL_REVIEW", "ACTIVE", "INACTIVE"]).nullish().transform((value) => value || "MANUAL_REVIEW"),
    sourceConfidence: z.enum(["MANUAL_REVIEW", "SOURCE_VERIFIED", "LOW_CONFIDENCE"]).nullish().transform((value) => value || "MANUAL_REVIEW"),
    retailPrice: nullableNumber(z.number().finite().min(0).max(10_000_000)),
    retailerName: optionalText(160),
    retailerSku: optionalText(160),
    estimatedHpGain: nullableNumber(z.number().finite().min(-2_000).max(5_000)),
    estimatedTorqueGain: nullableNumber(z.number().finite().min(-2_000).max(5_000)),
    gainBasis: optionalText(500),
    installComplexity: z.enum(["DIY", "SHOP_RECOMMENDED", "PRO_ONLY"]).nullish().transform((value) => value || null),
    notes: optionalText(4_000),
    makeId: nullableIdSchema,
    modelId: nullableIdSchema,
    yearStart: nullableNumber(z.number().finite().int().min(1886).max(2100)),
    yearEnd: nullableNumber(z.number().finite().int().min(1886).max(2100)),
    trim: optionalText(160),
    engine: optionalText(200),
  })
  .strict()
  .refine((input) => input.yearStart === null || input.yearEnd === null || input.yearEnd >= input.yearStart, {
    message: "Ending year cannot be before starting year.",
  });

export const updatePerformancePartAffiliateInputSchema = z.object({
  partId: databaseIdSchema,
  affiliatePartnerId: nullableIdSchema,
  affiliateUrl: optionalWebUrlSchema,
  trackingStatus: z.enum(["NOT_CONFIGURED", "CONFIGURED", "DISABLED", "NEEDS_REVIEW"]),
  commissionRateBps: nullableNumber(z.number().finite().int().min(0).max(10_000)),
}).strict();

export const updateAffiliatePartnerInputSchema = z.object({
  partnerId: databaseIdSchema,
  status: z.enum(["CANDIDATE", "APPROVED", "ACTIVE", "INACTIVE", "REJECTED"]),
  active: z.boolean(),
  network: optionalText(160),
  websiteUrl: optionalWebUrlSchema,
  commissionLabel: optionalText(160),
  trackingTemplate: optionalText(2_000),
  disclosure: optionalText(2_000),
}).strict();
