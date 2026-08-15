import { z } from "zod";
import { databaseIdSchema, optionalText } from "@/lib/validation/common-inputs";
import { vinClaimSchema } from "@/lib/validation/transaction-inputs";

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+().\-\s]*$/, "Enter a valid phone number.")
  .optional()
  .transform((value) => value || undefined);

const optionalMoneySchema = z.number().finite().min(0).max(100_000_000).optional();

export const dealerPurchaseInputSchema = z.object({
  listingId: databaseIdSchema,
  amount: z.number().finite().min(0).max(100_000_000),
  buyerName: z.string().trim().min(1).max(120).optional(),
  buyerEmail: z.string().trim().toLowerCase().max(254).email().optional(),
  buyerPhone: optionalPhoneSchema,
  buyerMessage: z.string().trim().max(2_000).optional(),
  requestedTerms: z
    .object({
      financingRequired: z.boolean().optional(),
      requestedDeliveryDate: z.string().trim().max(80).optional(),
      tradeInVin: vinClaimSchema.optional(),
    })
    .strict()
    .optional(),
});

export const insuranceQuoteInputSchema = z.object({
  purchaseId: databaseIdSchema,
  status: z.enum(["NOT_STARTED", "REQUESTED", "QUOTE_STARTED", "COMPLETED"]).optional(),
  carrierName: z.string().trim().min(1).max(160).optional(),
  intendedUse: z.string().trim().max(80).optional(),
  coveragePreference: z.string().trim().max(120).optional(),
  garagingState: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  garagingZip: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/).optional(),
});

export const transportQuoteInputSchema = z.object({
  purchaseId: databaseIdSchema,
  address: z.object({
    streetAddress: z.string().trim().min(1, "Complete delivery address is required.").max(180),
    city: z.string().trim().min(1, "Complete delivery address is required.").max(100),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Enter a two-letter state code."),
    postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/, "Enter a valid ZIP code."),
  }),
  transportMethod: z.enum(["ENCLOSED", "STANDARD", "OPEN"]).optional(),
  deliveryDate: z.string().trim().max(80).optional(),
  transporterName: z.string().trim().min(1).max(160).optional(),
  operableStatus: z.enum(["RUNNING", "NON_RUNNING"]).optional(),
  buyerPhone: optionalPhoneSchema,
  estimatedTransportPrice: optionalMoneySchema,
  depositAmount: optionalMoneySchema,
}).strict();

export const serviceBookingInputSchema = z.object({
  vin: vinClaimSchema,
  serviceName: z.string().trim().min(1, "Service name is required.").max(160),
  shopName: z.string().trim().min(1, "Shop is required.").max(160),
  preferredDate: z.string().trim().min(1, "Preferred date is required.").max(40),
  preferredTime: z.string().trim().min(1, "Preferred time is required.").max(40),
  notes: optionalText(2_000).transform((value) => value || undefined),
  customerPhone: optionalPhoneSchema,
  depositAmount: optionalMoneySchema,
  acceptedTerms: z.literal(true, {
    error: "You must accept the Terms of Use and Privacy Policy before payment.",
  }),
}).strict();
