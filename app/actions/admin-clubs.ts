"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

export async function adminHideClubAction(formData: FormData) {
  await assertAdmin();
  const clubId = readString(formData, "clubId");
  if (!clubId) throw new Error("Missing club id.");

  await prisma.carClub.update({
    where: { id: clubId },
    data: { status: "HIDDEN" },
  });

  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
  redirect("/admin/clubs");
}

export async function adminDeleteClubAction(formData: FormData) {
  await assertAdmin();
  const clubId = readString(formData, "clubId");
  if (!clubId) throw new Error("Missing club id.");

  await prisma.carClub.delete({ where: { id: clubId } });

  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
  redirect("/admin/clubs");
}

export async function adminTransferClubAction(formData: FormData) {
  await assertAdmin();
  const clubId = readString(formData, "clubId");
  const userId = readString(formData, "userId");
  if (!clubId || !userId) throw new Error("Club and new owner are required.");

  await prisma.$transaction([
    prisma.carClub.update({
      where: { id: clubId },
      data: { creatorId: userId },
    }),
    prisma.carClubMember.upsert({
      where: { clubId_userId: { clubId, userId } },
      update: { role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
      create: { clubId, userId, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
    }),
  ]);

  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
  redirect("/admin/clubs");
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}
