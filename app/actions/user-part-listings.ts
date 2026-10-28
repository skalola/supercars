"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createUserPartListing,
  duplicateUserPartListing,
  transitionUserPartListing,
  updateUserPartListing,
} from "@/lib/parts/user-part-listings";
import { deleteStoredFile, isUploadableImageFile, uploadPublicImage } from "@/lib/media/upload-storage";
import { prisma } from "@/lib/prisma";
import { enforceActionRateLimit } from "@/lib/security/action-rate-limit";
import { databaseIdSchema } from "@/lib/validation/common-inputs";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Sign in to manage part listings.");
  return session.user.id;
}

async function revalidateSellerGarage(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  revalidatePath("/garage");
  if (user?.username) revalidatePath(`/garage/${user.username}`);
}

export async function saveUserPartListingAction(listingId: string | null, input: unknown) {
  try {
    const userId = await requireUser();
    await enforceActionRateLimit({
      actorId: userId,
      action: "user_part_listing_write",
      bucketKey: listingId || "new",
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    const listing = listingId
      ? await updateUserPartListing(userId, databaseIdSchema.parse(listingId), input)
      : await createUserPartListing(userId, input);
    await revalidateSellerGarage(userId);
    return { ok: true as const, listingId: listing.id };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not save the part listing." };
  }
}

export async function uploadUserPartListingImageAction(listingId: string, formData: FormData) {
  let uploadedUrl: string | null = null;
  try {
    const userId = await requireUser();
    listingId = databaseIdSchema.parse(listingId);
    const listing = await prisma.userPartListing.findFirst({
      where: { id: listingId, sellerId: userId, status: { notIn: ["SOLD", "REMOVED"] } },
      select: { id: true, title: true, _count: { select: { images: true } } },
    });
    if (!listing) throw new Error("Part listing not found.");
    if (listing._count.images >= 12) throw new Error("A part listing can contain up to 12 photos.");

    const file = formData.get("file");
    if (!isUploadableImageFile(file)) throw new Error("Choose a JPG, PNG, or WebP image.");
    await enforceActionRateLimit({
      actorId: userId,
      action: "user_part_photo_upload",
      bucketKey: listing.id,
      limit: 24,
      windowMs: 60 * 60 * 1000,
    });
    const upload = await uploadPublicImage({ file, folder: `user-parts/${listing.id}` });
    uploadedUrl = upload.url;
    const image = await prisma.userPartListingImage.create({
      data: {
        listingId: listing.id,
        url: upload.url,
        storagePath: upload.pathname,
        alt: listing.title,
        displayOrder: listing._count.images,
        isPrimary: listing._count.images === 0,
      },
      select: { id: true, url: true, displayOrder: true, isPrimary: true },
    });
    await revalidateSellerGarage(userId);
    return { ok: true as const, image };
  } catch (error) {
    if (uploadedUrl) await deleteStoredFile(uploadedUrl).catch(() => undefined);
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not upload that photo." };
  }
}

export async function deleteUserPartListingImageAction(listingId: string, imageId: string) {
  try {
    const userId = await requireUser();
    listingId = databaseIdSchema.parse(listingId);
    imageId = databaseIdSchema.parse(imageId);
    const image = await prisma.userPartListingImage.findFirst({
      where: { id: imageId, listingId, listing: { sellerId: userId, status: { notIn: ["SOLD", "REMOVED"] } } },
      select: { id: true, url: true, isPrimary: true, listingId: true },
    });
    if (!image) throw new Error("Part photo not found.");
    await prisma.$transaction(async (transaction) => {
      await transaction.userPartListingImage.delete({ where: { id: image.id } });
      if (image.isPrimary) {
        const replacement = await transaction.userPartListingImage.findFirst({
          where: { listingId: image.listingId },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });
        if (replacement) await transaction.userPartListingImage.update({ where: { id: replacement.id }, data: { isPrimary: true } });
      }
    });
    await deleteStoredFile(image.url).catch(() => undefined);
    await revalidateSellerGarage(userId);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not remove that photo." };
  }
}

export async function setUserPartListingStatusAction(listingId: string, status: "ACTIVE" | "INACTIVE" | "SOLD" | "REMOVED") {
  try {
    const userId = await requireUser();
    listingId = databaseIdSchema.parse(listingId);
    await transitionUserPartListing(userId, listingId, status);
    await revalidateSellerGarage(userId);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not update the listing." };
  }
}

export async function duplicateUserPartListingAction(listingId: string) {
  try {
    const userId = await requireUser();
    listingId = databaseIdSchema.parse(listingId);
    await enforceActionRateLimit({
      actorId: userId,
      action: "user_part_listing_write",
      bucketKey: `duplicate:${listingId}`,
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    const listing = await duplicateUserPartListing(userId, listingId);
    await revalidateSellerGarage(userId);
    return { ok: true as const, listingId: listing.id };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not duplicate the listing." };
  }
}
