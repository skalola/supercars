import { z } from "zod";
import {
  boundedNoteSchema,
  databaseIdSchema,
  optionalBoundedNoteSchema,
  optionalEmailSchema,
  optionalText,
  optionalUrlSchema,
} from "@/lib/validation/common-inputs";
import { fulfillmentRequestIdSchema } from "@/lib/validation/transaction-inputs";

export const adminRecordIdSchema = databaseIdSchema;

export const adminMeetStatusInputSchema = z.object({
  meetId: databaseIdSchema,
  status: z.enum(["PUBLISHED", "HIDDEN", "CANCELLED", "COMPLETED"]),
});

export const adminClubTransferInputSchema = z.object({
  clubId: databaseIdSchema,
  userId: databaseIdSchema,
});

export const adminFulfillmentRequestSchema = z.object({
  requestId: fulfillmentRequestIdSchema,
});

export const adminFulfillmentCancelSchema = adminFulfillmentRequestSchema.extend({
  reason: boundedNoteSchema.min(1, "A cancellation reason is required."),
});

export const adminFulfillmentNoteSchema = adminFulfillmentRequestSchema.extend({
  note: optionalBoundedNoteSchema,
});

export const partnerConfidenceSchema = z.enum([
  "VERIFIED",
  "PUBLIC_SOURCE",
  "MANUAL_REVIEW",
  "UNRESOLVED_EMAIL",
]);

export const contactSourceSchema = z.enum([
  "IMPORTED_LISTING",
  "PUBLIC_WEBSITE",
  "MANUALLY_VERIFIED",
]);

export const resolvePartnerEmailInputSchema = z.object({
  partnerContactId: databaseIdSchema,
  newEmail: z.string().trim().toLowerCase().max(254).email("Enter a valid email address."),
  confidence: partnerConfidenceSchema,
  source: contactSourceSchema,
});

export const addVendorInputSchema = z
  .object({
    name: z.string().trim().min(1, "Vendor name is required.").max(160),
    type: z.enum(["DEALER", "INSURER", "TRANSPORTER", "SERVICE_SHOP"]),
    email: optionalEmailSchema,
    phone: optionalText(40),
    website: optionalUrlSchema,
    location: optionalText(200),
    makeSpecialization: optionalText(100).transform((value) => value || "ALL"),
  })
  .refine((input) => Boolean(input.email || input.phone || input.website), {
    message: "Add at least one contact method: email, phone, or website.",
  });

export const marketingSettingInputSchema = z.object({
  key: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
});
