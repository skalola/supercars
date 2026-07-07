"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function toggleGarageItem(modelId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthenticated" };
  }

  const existing = await prisma.garageItem.findUnique({
    where: {
      userId_modelId: {
        userId: session.user.id,
        modelId,
      },
    },
  });

  if (existing) {
    await prisma.garageItem.delete({
      where: { id: existing.id },
    });
  } else {
    await prisma.garageItem.create({
      data: {
        userId: session.user.id,
        modelId,
      },
    });
  }

  revalidatePath("/garage");
  revalidatePath("/make/[slug]/[modelSlug]");
  return { ok: true, saved: !existing };
}
