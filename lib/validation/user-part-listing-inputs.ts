import { z } from "zod";
import { databaseIdSchema, optionalText } from "@/lib/validation/common-inputs";

export const USER_PART_CONDITIONS = ["NEW", "OPEN_BOX", "USED", "REBUILT", "FOR_PARTS"] as const;
export const USER_PART_SHIPPING_MODES = ["SHIPPING", "LOCAL_PICKUP", "BOTH"] as const;
export const USER_PART_RETURN_POLICIES = ["NO_RETURNS", "RETURNS_ACCEPTED"] as const;
export const USER_PART_LISTING_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE", "RESERVED", "SOLD", "REMOVED"] as const;

const nullableId = databaseIdSchema.nullish().transform((value) => value || null);

export const userPartFitmentInputSchema = z.object({
  makeId: databaseIdSchema,
  modelId: databaseIdSchema,
  modelVariantId: nullableId,
  yearStart: z.number().int().min(1886).max(2100).nullish().transform((value) => value ?? null),
  yearEnd: z.number().int().min(1886).max(2100).nullish().transform((value) => value ?? null),
  trim: optionalText(120),
  engine: optionalText(160),
  transmission: optionalText(120),
  drivetrain: optionalText(60),
  bodyStyle: optionalText(80),
}).strict().refine((value) => value.yearStart === null || value.yearEnd === null || value.yearEnd >= value.yearStart, {
  message: "Ending fitment year cannot be before the starting year.",
});

export const userPartListingInputSchema = z.object({
  componentTypeId: databaseIdSchema,
  brandId: nullableId,
  removedFromVehicleId: nullableId,
  title: z.string().trim().min(5, "Enter a descriptive part title.").max(180),
  description: z.string().trim().min(20, "Describe the part, its condition, and what is included.").max(5_000),
  brandName: optionalText(120),
  manufacturerPartNumber: optionalText(120),
  condition: z.enum(USER_PART_CONDITIONS),
  priceCents: z.number().int().min(100, "Price must be at least $1.").max(100_000_000),
  currency: z.literal("USD").default("USD"),
  quantity: z.number().int().min(1).max(100).default(1),
  mileageOnPart: z.number().int().min(0).max(2_000_000).nullish().transform((value) => value ?? null),
  includedHardware: optionalText(1_000),
  knownDefects: optionalText(2_000),
  shippingMode: z.enum(USER_PART_SHIPPING_MODES),
  shippingCostCents: z.number().int().min(0).max(1_000_000).nullish().transform((value) => value ?? null),
  shipsFromCity: optionalText(100),
  shipsFromState: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter state abbreviation.").nullish().transform((value) => value || null),
  returnPolicy: z.enum(USER_PART_RETURN_POLICIES),
  sellerAttestationAccepted: z.boolean().default(false),
  universalFitment: z.boolean().default(false),
  fitments: z.array(userPartFitmentInputSchema).max(50).default([]),
}).strict().superRefine((value, context) => {
  if (!value.brandId && !value.brandName) {
    context.addIssue({ code: "custom", path: ["brandName"], message: "Select or enter the part brand." });
  }
  if (value.shippingMode !== "LOCAL_PICKUP" && value.shippingCostCents === null) {
    context.addIssue({ code: "custom", path: ["shippingCostCents"], message: "Enter the shipping cost, including zero for free shipping." });
  }
  if (value.shippingMode !== "SHIPPING" && (!value.shipsFromCity || !value.shipsFromState)) {
    context.addIssue({ code: "custom", path: ["shipsFromCity"], message: "Local pickup listings require a city and state." });
  }
  if (value.universalFitment && value.fitments.length > 0) {
    context.addIssue({ code: "custom", path: ["fitments"], message: "Universal parts cannot also declare vehicle-specific fitment." });
  }
  if (!value.universalFitment && value.fitments.length === 0) {
    context.addIssue({ code: "custom", path: ["fitments"], message: "Add at least one compatible vehicle." });
  }
});

export type UserPartListingInput = z.infer<typeof userPartListingInputSchema>;
