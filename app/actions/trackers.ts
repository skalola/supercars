"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type TrackerType = "listing" | "price" | "maintenance" | "events";

const preferenceFieldByType = {
  listing: "listingTrackerEnabled",
  price: "priceTrackerEnabled",
  maintenance: "maintenanceTrackerEnabled",
  events: "eventsTrackerEnabled",
} as const;

export async function toggleTrackerPreference(type: TrackerType, enabled: boolean) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthenticated" };
  }

  const field = preferenceFieldByType[type];
  if (!field) {
    return { ok: false, reason: "invalid_tracker" };
  }

  const userId = session.user.id as string;

  await prisma.userTrackerPreference.upsert({
    where: { userId },
    update: { [field]: enabled },
    create: {
      userId,
      [field]: enabled,
    },
  });

  if (type === "listing") {
    await prisma.garageItem.updateMany({
      where: { userId },
      data: { listingTrackerAlertsEnabled: enabled },
    });
  }

  if (type === "price") {
    const items = await prisma.garageItem.findMany({
      where: { userId },
      select: { id: true, modelId: true },
    });

    await Promise.all(
      items.map(async (item) =>
        prisma.garageItem.update({
          where: { id: item.id },
          data: {
            priceTrackerAlertsEnabled: enabled,
            priceTrackerBaseline: enabled ? await getCurrentLowestListingPrice(item.modelId) : null,
          },
        })
      )
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  revalidatePath("/garage");
  if (user?.username) {
    revalidatePath(`/garage/${user.username}`);
    revalidatePath(`/garage/${user.username}/trackers`);
  }

  return { ok: true, type, enabled };
}

async function getCurrentLowestListingPrice(modelId: string) {
  const listing = await prisma.listing.findFirst({
    where: {
      modelId,
      status: "ACTIVE",
      priceStatus: { not: "PRICE_INVALID" },
      OR: [{ askingPrice: { gt: 0 } }, { price: { gt: 0 } }],
    },
    orderBy: [{ askingPrice: "asc" }, { price: "asc" }],
    select: {
      askingPrice: true,
      price: true,
    },
  });

  return listing?.askingPrice || listing?.price || null;
}
