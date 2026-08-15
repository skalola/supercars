"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { trackerPreferenceInputSchema } from "@/lib/validation/community-inputs";

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
  const parsed = trackerPreferenceInputSchema.safeParse({ type, enabled });
  if (!parsed.success) return { ok: false, reason: "invalid_tracker" };
  type = parsed.data.type;
  enabled = parsed.data.enabled;

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
    if (enabled) {
      await prisma.$executeRaw`
        UPDATE "GarageItem" item
        SET
          "priceTrackerAlertsEnabled" = true,
          "priceTrackerBaseline" = (
            SELECT min(COALESCE(listing."askingPrice", listing."price"))
            FROM "Listing" listing
            WHERE listing."modelId" = item."modelId"
              AND listing."status" = 'ACTIVE'
              AND listing."priceStatus" IS DISTINCT FROM 'PRICE_INVALID'
              AND COALESCE(listing."askingPrice", listing."price") > 0
          ),
          "updatedAt" = now()
        WHERE item."userId" = ${userId}
      `;
    } else {
      await prisma.garageItem.updateMany({
        where: { userId },
        data: {
          priceTrackerAlertsEnabled: false,
          priceTrackerBaseline: null,
        },
      });
    }
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
