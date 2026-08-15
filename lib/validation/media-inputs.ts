import { z } from "zod";
import { databaseIdSchema, optionalText } from "@/lib/validation/common-inputs";

export const vehiclePhotoMetadataSchema = z.object({
  caption: optionalText(500),
});

export const uploadedVehiclePhotoSchema = z.object({
  url: z.url().max(2_000),
  pathname: z.string().trim().min(1).max(500),
  caption: optionalText(500),
}).strict();

export const vehicleDocumentMetadataSchema = z.object({
  title: z.string().trim().min(1, "Document title is required.").max(160),
  documentType: z.string().trim().min(1, "Document type is required.").max(80),
});

export const mediaRecordIdSchema = databaseIdSchema;

export const vehiclePhotoOrderSchema = z
  .array(databaseIdSchema)
  .min(1)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, "Photo order contains duplicates.");
