"use server";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usernameInputSchema } from "@/lib/validation/community-inputs";

export async function updateUsername(formData: FormData): Promise<void> {
  const usernameInput = formData.get("username")?.toString() || "";
  const session = await auth();
  
  if (!session?.user) {
    redirect("/login");
  }
  const parsedUsername = usernameInputSchema.safeParse(usernameInput);
  if (!parsedUsername.success) {
    return;
  }
  const username = parsedUsername.data;

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
