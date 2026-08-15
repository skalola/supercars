"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { adminClubTransferInputSchema, adminRecordIdSchema } from "@/lib/validation/admin-inputs";

export async function adminHideClubAction(formData: FormData) {
  await assertAdmin();
  const clubId = adminRecordIdSchema.parse(readString(formData, "clubId"));

  await prisma.carClub.update({
    where: { id: clubId },
    data: { status: "HIDDEN" },
  });

  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
  updateTag("public-clubs");
  redirect("/admin/clubs");
}

export async function adminDeleteClubAction(formData: FormData) {
  await assertAdmin();
  const clubId = adminRecordIdSchema.parse(readString(formData, "clubId"));

  await prisma.carClub.delete({ where: { id: clubId } });

  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
  updateTag("public-clubs");
  redirect("/admin/clubs");
}

export async function adminTransferClubAction(formData: FormData) {
  await assertAdmin();
  const { clubId, userId } = adminClubTransferInputSchema.parse({
    clubId: readString(formData, "clubId"),
    userId: readString(formData, "userId"),
  });

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
  updateTag("public-clubs");
  redirect("/admin/clubs");
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}
