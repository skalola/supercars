import { z } from "zod";
import { databaseIdSchema, optionalText } from "@/lib/validation/common-inputs";
import { vinClaimSchema } from "@/lib/validation/transaction-inputs";

export const usernameInputSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be 32 characters or fewer.")
  .regex(/^[a-z0-9_-]+$/, "Use only letters, numbers, underscores, and hyphens.");

export const profileInputSchema = z.object({
  name: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(80))
    .transform((value) => value || null),
  username: usernameInputSchema,
});

export const garageItemIdSchema = databaseIdSchema;

export const garageAlertInputSchema = z.object({
  itemId: databaseIdSchema,
  alertType: z.enum(["price", "listing"]),
  enabled: z.boolean(),
});

export const trackerPreferenceInputSchema = z.object({
  type: z.enum(["listing", "price", "maintenance", "events"]),
  enabled: z.boolean(),
});

export const vehicleListingInputSchema = z.object({
  vin: vinClaimSchema,
  askingPrice: z.number().finite().positive("Please enter a valid asking price.").max(100_000_000),
});

const idListSchema = z.array(databaseIdSchema).max(500).transform((values) => [...new Set(values)]);

export const createClubInputSchema = z
  .object({
    name: z.string().trim().min(3, "Club name must be at least 3 characters.").max(100),
    nationwide: z.boolean(),
    city: z.string().trim().max(100),
    state: z.string().trim().toUpperCase().max(2),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("US"),
    description: optionalText(2_000),
    visibility: z.enum(["PUBLIC", "PRIVATE"]),
    modelIds: idListSchema,
    makeIds: idListSchema,
  })
  .transform((input) => ({
    ...input,
    city: input.nationwide ? "Nationwide" : input.city,
    state: input.nationwide ? "US" : input.state,
  }))
  .refine((input) => Boolean(input.city && input.state), "City and state are required.");

export const updateClubProfileInputSchema = z.object({
  clubId: databaseIdSchema,
  name: z.string().trim().min(3).max(100),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().toUpperCase().min(2).max(2),
  description: optionalText(2_000),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
});

export const updateClubModelsInputSchema = z.object({
  clubId: databaseIdSchema,
  modelIds: idListSchema,
  makeIds: idListSchema,
});

export const clubMemberActionInputSchema = z.object({
  memberId: databaseIdSchema,
  action: z.enum(["APPROVE", "DECLINE", "REMOVE", "PROMOTE", "DEMOTE"]),
});

export const clubInviteTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .regex(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "Invalid club invite token.");
