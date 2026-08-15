"use server";

import { AuthError } from "next-auth";
import { Prisma } from "@prisma/client";
import { signIn, testCredentialsEnabled } from "@/auth";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import {
  enforceActionRateLimit,
  hashRateLimitIdentifier,
  isActionRateLimitError,
} from "@/lib/security/action-rate-limit";
import { accountRegistrationSchema, accountSignInSchema } from "@/lib/validation/auth-inputs";

export type AuthActionState = {
  error?: string;
};

export async function accountSignInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = accountSignInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: "Enter your username or email and password." };

  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") || ""));
  const identifier = parsed.data.identifier.trim().toLowerCase();
  const adminEmail = process.env.ADMIN_TEST_EMAIL?.trim().toLowerCase() || "";
  const testUserEmail = process.env.USER_TEST_EMAIL?.trim().toLowerCase() || "";
  const provider = testCredentialsEnabled && identifier === adminEmail
    ? "admin-test"
    : testCredentialsEnabled && identifier === testUserEmail
      ? "user-test"
      : "credentials";

  try {
    await signIn(provider, {
      identifier,
      email: identifier,
      password: parsed.data.password,
      redirectTo: returnTo || (provider === "admin-test" ? "/admin" : "/garage"),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "The username, email, or password is incorrect." };
    }
    throw error;
  }

  return {};
}

export async function accountRegistrationAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = accountRegistrationSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Check your account details and try again." };
  }

  const { username, email, password } = parsed.data;
  try {
    await enforceActionRateLimit({
      actorId: hashRateLimitIdentifier(email),
      action: "account_registration",
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
  } catch (error) {
    if (isActionRateLimitError(error)) return { error: error.message };
    throw error;
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: { equals: email, mode: "insensitive" } }, { username }] },
    select: { id: true },
  });
  if (existing) return { error: "That email or username is already in use." };

  const passwordHash = await hashPassword(password);

  try {
    await prisma.user.create({
      data: {
        username,
        name: username,
        email,
        passwordHash,
        role: "USER",
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That email or username is already in use." };
    }
    throw error;
  }

  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") || ""));
  await signIn("credentials", {
    identifier: email,
    password,
    redirectTo: returnTo || "/garage",
  });

  return {};
}

function sanitizeReturnTo(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "";
  return trimmed;
}
