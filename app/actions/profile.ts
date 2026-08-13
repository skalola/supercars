"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const USERNAME_RE = /^[a-z0-9_-]+$/;

export type UpdateProfileState = {
  ok?: boolean;
  error?: string;
};

export async function updateProfileAction(
  _state: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  if (!userId) redirect("/login");

  const name = cleanText(formData.get("name"), 80);
  const username = cleanUsername(formData.get("username"));
  const image = cleanUrl(formData.get("image"));

  if (!username) {
    return { error: "Choose a username with at least 3 letters, numbers, underscores, or hyphens." };
  }

  const existing = await prisma.user.findFirst({
    where: {
      username,
      id: { not: userId },
    },
    select: { id: true },
  });

  if (existing) {
    return { error: "That username is already taken." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      username,
      image,
    },
  });

  revalidatePath("/");
  revalidatePath("/garage");
  revalidatePath(`/garage/${username}`);

  return { ok: true };
}

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  const text = value?.toString().replace(/\s+/g, " ").trim() || null;
  if (!text) return null;
  return text.slice(0, maxLength);
}

function cleanUsername(value: FormDataEntryValue | null) {
  const username = value?.toString().trim().toLowerCase() || "";
  if (username.length < 3 || username.length > 32 || !USERNAME_RE.test(username)) return null;
  return username;
}

function cleanUrl(value: FormDataEntryValue | null) {
  const raw = value?.toString().trim() || "";
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
