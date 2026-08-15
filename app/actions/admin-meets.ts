"use server";

import { revalidatePath, updateTag } from "next/cache";
import { assertAdmin } from "@/lib/admin/auth";
import { notifyMeetCancelled } from "@/lib/meets/meet-notifications";
import { prisma } from "@/lib/prisma";
import { adminMeetStatusInputSchema, adminRecordIdSchema } from "@/lib/validation/admin-inputs";
import { validationMessage } from "@/lib/validation/common-inputs";

type AdminMeetActionResult = {
  success: boolean;
  message: string;
};

export async function updateMeetStatusAction(meetId: string, status: "PUBLISHED" | "HIDDEN" | "CANCELLED" | "COMPLETED"): Promise<AdminMeetActionResult> {
  try {
    await assertAdmin();
    const parsed = adminMeetStatusInputSchema.safeParse({ meetId, status });
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    meetId = parsed.data.meetId;
    status = parsed.data.status;

    const meet = await prisma.meet.findUnique({
      where: { id: meetId },
      select: { id: true, slug: true, title: true },
    });

    if (!meet) {
      return { success: false, message: "Meet not found." };
    }

    await prisma.meet.update({
      where: { id: meet.id },
      data: {
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : undefined,
        cancelledAt: status === "CANCELLED" ? new Date() : undefined,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
      },
    });

    if (status === "CANCELLED") {
      await notifyMeetCancelled(meet.id);
    }

    revalidatePath("/admin/meets");
    revalidatePath("/meets");
    updateTag("public-meets");
    revalidatePath(`/meets/${meet.slug}`);

    return { success: true, message: `${meet.title} marked ${status.toLowerCase()}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to update meet." };
  }
}

export async function deleteMeetAction(meetId: string): Promise<AdminMeetActionResult> {
  try {
    await assertAdmin();
    const parsedId = adminRecordIdSchema.safeParse(meetId);
    if (!parsedId.success) return { success: false, message: validationMessage(parsedId.error) };
    meetId = parsedId.data;

    const meet = await prisma.meet.findUnique({
      where: { id: meetId },
      select: { id: true, slug: true, title: true },
    });

    if (!meet) {
      return { success: false, message: "Meet not found." };
    }

    await prisma.meet.delete({ where: { id: meet.id } });

    revalidatePath("/admin/meets");
    revalidatePath("/meets");
    updateTag("public-meets");
    revalidatePath(`/meets/${meet.slug}`);

    return { success: true, message: `${meet.title} deleted.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to delete meet." };
  }
}

export async function deleteMeetPhotoAction(photoId: string): Promise<AdminMeetActionResult> {
  try {
    await assertAdmin();
    const parsedId = adminRecordIdSchema.safeParse(photoId);
    if (!parsedId.success) return { success: false, message: validationMessage(parsedId.error) };
    photoId = parsedId.data;

    const photo = await prisma.meetPhoto.findUnique({
      where: { id: photoId },
      select: {
        id: true,
        meet: { select: { slug: true, title: true } },
        vehicle: { select: { vin: true } },
        user: { select: { username: true } },
      },
    });

    if (!photo) {
      return { success: false, message: "Meet photo not found." };
    }

    await prisma.meetPhoto.delete({ where: { id: photo.id } });

    revalidatePath("/admin/meets");
    revalidatePath("/meets");
    updateTag("public-meets");
    revalidatePath(`/meets/${photo.meet.slug}`);
    if (photo.vehicle?.vin) revalidatePath(`/vehicle/${photo.vehicle.vin}`);
    revalidatePath("/garage");
    if (photo.user?.username) revalidatePath(`/garage/${photo.user.username}`);

    return { success: true, message: `Photo removed from ${photo.meet.title}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to delete meet photo." };
  }
}
