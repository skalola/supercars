import { z } from "zod";

export const fulfillmentRequestIdSchema = z.string().uuid();

export const safeReturnPathSchema = z
  .string()
  .max(500)
  .refine((value) => value.startsWith("/") && !value.startsWith("//"), "Invalid return path.")
  .catch("/transactions");

export const checkoutRequestSchema = z.object({
  fulfillmentRequestId: fulfillmentRequestIdSchema,
  returnTo: safeReturnPathSchema.optional(),
});

export const partnerDecisionSubmissionSchema = z.object({
  note: z.string().trim().max(1_000).optional(),
});

export const vinClaimSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Enter a valid 17-character VIN.");
