"use server";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const USERNAME_RE = /^[a-z0-9_-]+$/;

export async function updateUsername(formData: FormData): Promise<void> {
  const username = formData.get("username")?.toString()?.trim().toLowerCase();
  const session = await auth();
  
  if (!session?.user || !username) {
    redirect("/login");
  }

  if (username.length < 3 || !USERNAME_RE.test(username)) {
    return;
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return;
    }

    await prisma.user.update({
      where: { id: session.user.id as string },
      data: { username },
    });
  } catch (e) {
    console.error("Error updating username:", e);
    return;
  }

  redirect(`/garage/${username}`);
}
