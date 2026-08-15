import { z } from "zod";
import { databaseIdSchema, optionalText, optionalUrlSchema } from "@/lib/validation/common-inputs";

const dateTimeSchema = z
  .string()
  .trim()
  .min(1, "Choose an event date and time.")
  .max(50)
  .transform((value, context) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({ code: "custom", message: "Choose a valid event date and time." });
      return z.NEVER;
    }
    return date;
  });

const capacitySchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
  z.number().finite().int().min(2).max(10_000).nullable()
);

const meetFields = {
  title: z.string().trim().min(1, "Title is required.").max(160),
  type: z.enum(["Cars & Coffee", "Cruise", "Track Day"]),
  startsAt: dateTimeSchema,
  capacity: capacitySchema,
  city: z.string().trim().min(1, "City is required.").max(100),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Enter a two-letter state code."),
  locationName: z.string().trim().min(1, "Location name is required.").max(160),
  locationDetail: z.string().trim().min(1).max(500),
  exactAddress: optionalText(240),
  description: optionalText(3_000),
  visibility: z.enum(["PUBLIC", "INVITE_ONLY"]),
};

export const createMeetInputSchema = z.object(meetFields);

export const updateMeetInputSchema = z.object({
  meetId: databaseIdSchema,
  ...meetFields,
});

export const meetRsvpInputSchema = z.object({
  meetId: databaseIdSchema,
  vehicleId: databaseIdSchema.nullish().transform((value) => value || null),
  status: z.enum(["GOING", "MAYBE", "CANCELLED"]),
});

export const manageMeetRsvpInputSchema = z.object({
  rsvpId: databaseIdSchema,
  action: z.enum(["REMOVE", "GOING", "MAYBE", "WAITLISTED"]),
});

export const addMeetPhotoInputSchema = z.object({
  meetId: databaseIdSchema,
  vehicleId: databaseIdSchema.nullish().transform((value) => value || null),
  photoUrl: optionalUrlSchema,
  caption: optionalText(500),
});
