"use server";

import { auth } from "@/auth";
import { isUploadableImageFile, uploadPublicImage } from "@/lib/media/upload-storage";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enforceActionRateLimit } from "@/lib/security/action-rate-limit";
import { profileInputSchema } from "@/lib/validation/community-inputs";

export type UpdateProfileState = {
  ok?: boolean;
  error?: string;
};

export async function updateProfileAction(
  _state: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  if (!userId) redirect("/login");

  const parsedProfile = profileInputSchema.safeParse({
    name: String(formData.get("name") || ""),
    username: String(formData.get("username") || ""),
  });
  const profileImage = formData.get("profileImage");

  if (!parsedProfile.success) {
    return { error: "Choose a username with at least 3 letters, numbers, underscores, or hyphens." };
  }
  const { name, username } = parsedProfile.data;

  const [existing, currentUser] = await Promise.all([
    prisma.user.findFirst({
      where: {
        username,
        id: { not: userId },
      },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    }),
  ]);

  if (existing) {
    return { error: "That username is already taken." };
  }

  if (!currentUser) redirect("/login");

  let image = currentUser.image;
  if (isUploadableImageFile(profileImage)) {
    try {
      await enforceActionRateLimit({
        actorId: userId,
        action: "profile_upload",
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      const upload = await uploadPublicImage({
        file: profileImage,
        folder: `profiles/${userId}`,
      });
      image = upload.url;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not upload that profile photo." };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      username,
      image,
    },
  });

  revalidatePath("/");
  revalidatePath("/profile/edit");
  revalidatePath("/garage");
  revalidatePath(`/garage/${username}`);

  return { ok: true };
}
