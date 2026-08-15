import { z } from "zod";

export const databaseIdSchema = z
  .string()
  .trim()
  .min(1, "Missing record id.")
  .max(64, "Invalid record id.")
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid record id.");

export const boundedNoteSchema = z.string().trim().max(1_000, "Note is too long.");

export const optionalBoundedNoteSchema = boundedNoteSchema.optional().transform((value) => value || undefined);

export const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullish()
    .transform((value) => value || null);

export const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter a valid email address.")
  .nullish()
  .or(z.literal(""))
  .transform((value) => value || null);

export const optionalUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .url("Enter a valid URL, including https://.")
  .refine((value) => /^https?:\/\//i.test(value), "Only HTTP and HTTPS URLs are allowed.")
  .nullish()
  .or(z.literal(""))
  .transform((value) => value || null);

export function validationMessage(error: z.ZodError, fallback = "Invalid request.") {
  return error.issues[0]?.message || fallback;
}
