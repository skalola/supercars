import { z } from "zod";
import { databaseIdSchema, optionalText } from "@/lib/validation/common-inputs";

const calendarDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid date.");

const optionalCalendarDateSchema = z
  .union([calendarDateSchema, z.literal(""), z.null(), z.undefined()])
  .transform((value) => value || null);

const optionalMileageSchema = z.number().finite().int().min(0).max(2_000_000).nullish().transform((value) => value ?? null);
const requiredMileageSchema = z.number().finite().int().min(0).max(2_000_000);
const optionalCostSchema = z.number().finite().min(0).max(100_000_000).nullish().transform((value) => value ?? null);
const optionalGainSchema = z.number().finite().min(-2_000).max(5_000).nullish().transform((value) => value ?? null);

export const vehicleProfileInputSchema = z.object({
  exteriorColor: optionalText(80),
  interiorColor: optionalText(80),
  currentMileage: optionalMileageSchema,
  ownerNotes: optionalText(5_000),
}).strict();

export const vehicleModificationInputSchema = z.object({
  name: z.string().trim().min(1, "Modification name is required.").max(160),
  brand: optionalText(120),
  description: optionalText(2_000),
  installedDate: optionalCalendarDateSchema,
  categoryId: databaseIdSchema.nullish().transform((value) => value || null),
  hpGainOverride: optionalGainSchema,
  torqueGainOverride: optionalGainSchema,
}).strict();

export const vehicleInstalledPartInputSchema = z.object({
  partId: databaseIdSchema,
  installedDate: optionalCalendarDateSchema,
  notes: optionalText(2_000),
  hpGainOverride: optionalGainSchema,
  torqueGainOverride: optionalGainSchema,
}).strict();

export const deleteVehicleModificationInputSchema = z
  .object({
    modificationId: databaseIdSchema.nullish().transform((value) => value || null),
    installedPartId: databaseIdSchema.nullish().transform((value) => value || null),
  })
  .strict()
  .refine((value) => Boolean(value.modificationId || value.installedPartId), "Choose a modification to delete.");

export const serviceRecordInputSchema = z.object({
  serviceDate: calendarDateSchema,
  mileage: optionalMileageSchema,
  shopName: optionalText(160),
  description: optionalText(3_000),
  cost: optionalCostSchema,
}).strict();

export const completeMaintenanceInputSchema = z.object({
  serviceName: z.string().trim().min(1, "Service name is required.").max(160),
  serviceDate: calendarDateSchema,
  mileage: requiredMileageSchema,
  shopName: optionalText(160),
  description: optionalText(3_000),
  cost: optionalCostSchema,
}).strict();

export const vehicleAwardInputSchema = z.object({
  title: z.string().trim().min(1, "Award title is required.").max(160),
  eventName: optionalText(160),
  awardDate: optionalCalendarDateSchema,
  description: optionalText(2_000),
}).strict();
