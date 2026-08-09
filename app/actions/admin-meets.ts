"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin/auth";
import { notifyMeetCancelled } from "@/lib/meets/meet-notifications";
import { prisma } from "@/lib/prisma";

type AdminMeetActionResult = {
  success: boolean;
  message: string;
};

export async function updateMeetStatusAction(meetId: string, status: "PUBLISHED" | "HIDDEN" | "CANCELLED" | "COMPLETED"): Promise<AdminMeetActionResult> {
  try {
    await assertAdmin();

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
    revalidatePath(`/meets/${meet.slug}`);

    return { success: true, message: `${meet.title} marked ${status.toLowerCase()}.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to update meet." };
  }
}

export async function deleteMeetAction(meetId: string): Promise<AdminMeetActionResult> {
  try {
    await assertAdmin();

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
    revalidatePath(`/meets/${meet.slug}`);

    return { success: true, message: `${meet.title} deleted.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Failed to delete meet." };
  }
}
