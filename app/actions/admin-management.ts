"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

type AdminActionResult = {
  success: boolean;
  message: string;
};

export async function removeUserAction(userId: string): Promise<AdminActionResult> {
  try {
    const session = await assertAdmin();
    const adminId = session.user?.id;

    if (!userId) {
      return { success: false, message: "Missing user id." };
    }

    if (adminId === userId) {
      return { success: false, message: "You cannot remove the admin account you are currently using." };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      return { success: false, message: "User not found." };
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/overview");

    return {
      success: true,
      message: `Removed ${user.email || "user"} and related account records.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove user.";
    return { success: false, message };
  }
}

export async function unpublishListingAction(listingId: string): Promise<AdminActionResult> {
  try {
    await assertAdmin();

    if (!listingId) {
      return { success: false, message: "Missing listing id." };
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true },
    });

    if (!listing) {
      return { success: false, message: "Listing not found." };
    }

    if (listing.status === "REMOVED") {
      return { success: true, message: "Listing is already unpublished." };
    }

    await prisma.listing.update({
      where: { id: listingId },
      data: {
        status: "REMOVED",
        freshnessStatus: "REMOVED",
        lastSeen: new Date(),
      },
    });

    revalidatePath("/admin/listings");
    revalidatePath("/admin/overview");
    revalidatePath("/inventory");

    return { success: true, message: "Listing unpublished." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unpublish listing.";
    return { success: false, message };
  }
}

export async function removeListingAction(listingId: string): Promise<AdminActionResult> {
  try {
    await assertAdmin();

    if (!listingId) {
      return { success: false, message: "Missing listing id." };
    }

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, externalListingId: true },
    });

    if (!listing) {
      return { success: false, message: "Listing not found." };
    }

    await prisma.listing.delete({
      where: { id: listingId },
    });

    revalidatePath("/admin/listings");
    revalidatePath("/admin/overview");
    revalidatePath("/inventory");

    return {
      success: true,
      message: `Permanently removed listing ${listing.externalListingId || listing.id}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to permanently remove listing.";
    return { success: false, message };
  }
}
