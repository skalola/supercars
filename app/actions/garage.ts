"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function toggleGarageItem(modelId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthenticated" };
  }

  const userId = session.user.id;

  const existing = await prisma.garageItem.findUnique({
    where: {
      userId_modelId: {
        userId,
        modelId,
      },
    },
  });

  if (existing) {
    // Remove the garage item
    await prisma.garageItem.delete({
      where: { id: existing.id },
    });

    // Also handle ownership: remove association and reset status if they had a vehicle of this model
    await prisma.vehicle.updateMany({
      where: {
        modelId,
        ownerId: userId,
      },
      data: {
        ownerId: null,
        status: "UNCLAIMED",
      },
    });
  } else {
    await prisma.garageItem.create({
      data: {
        userId,
        modelId,
      },
    });
  }

  revalidatePath("/garage");
  revalidatePath("/make/[slug]/[modelSlug]");
  return { ok: true, saved: !existing };
}
