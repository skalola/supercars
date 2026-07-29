"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type GarageAlertType = "price" | "listing";

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
    const trackerPreference = await prisma.userTrackerPreference.findUnique({
      where: { userId },
      select: {
        listingTrackerEnabled: true,
        priceTrackerEnabled: true,
      },
    });

    await prisma.garageItem.create({
      data: {
        userId,
        modelId,
        listingTrackerAlertsEnabled: trackerPreference?.listingTrackerEnabled ?? false,
        priceTrackerAlertsEnabled: trackerPreference?.priceTrackerEnabled ?? false,
        priceTrackerBaseline: trackerPreference?.priceTrackerEnabled
          ? await getCurrentLowestListingPrice(modelId)
          : null,
      },
    });
  }

  revalidatePath("/garage");
  revalidatePath("/make/[slug]/[modelSlug]");
  return { ok: true, saved: !existing };
}

export async function toggleGarageAlert(itemId: string, alertType: GarageAlertType, enabled: boolean) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "unauthenticated" };
  }

  const item = await prisma.garageItem.findFirst({
    where: {
      id: itemId,
      userId: session.user.id as string,
    },
    include: {
      user: {
        select: {
          username: true,
        },
      },
      model: {
        include: {
          make: true,
        },
      },
    },
  });

  if (!item) {
    return { ok: false, reason: "not_found" };
  }

  const data =
    alertType === "price"
      ? {
          priceTrackerAlertsEnabled: enabled,
          priceTrackerBaseline: enabled ? await getCurrentLowestListingPrice(item.modelId) : null,
        }
      : {
          listingTrackerAlertsEnabled: enabled,
        };

  await prisma.garageItem.update({
    where: { id: item.id },
    data,
  });

  revalidatePath("/garage");
  if (item.user.username) revalidatePath(`/garage/${item.user.username}`);

  return {
    ok: true,
    enabled,
    alertType,
    label: `${item.model.make.name} ${item.model.name}`,
  };
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
