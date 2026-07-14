"use server";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function updateUsername(formData: FormData): Promise<void> {
  const username = formData.get("username")?.toString()?.trim().toLowerCase();
  const session = await auth();
  
  if (!session?.user || !username) {
    redirect("/login");
  }

  if (username.length < 3) {
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
