import { z } from "zod";
import { usernameInputSchema } from "@/lib/validation/community-inputs";

export const accountSignInSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});

export const accountRegistrationSchema = z
  .object({
    username: usernameInputSchema,
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
    password: z
      .string()
      .min(10, "Password must be at least 10 characters.")
      .max(128, "Password must be 128 characters or fewer."),
    confirmPassword: z.string(),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
