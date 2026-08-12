"use server";

import { auth } from "@/auth";
import { isUploadableImageFile, uploadPublicFile, uploadPublicImage } from "@/lib/media/upload-storage";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";

function safeRevalidatePath(vin: string) {
  try {
    revalidatePath(`/vehicle/${vin}`);
    revalidatePath(`/vehicle/${vin}/edit`);
  } catch {
    // Ignore in non-HTTP-request scope
  }
}

async function verifyOwnership(vin: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (globalThis as any).mockSession !== undefined ? (globalThis as any).mockSession : await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: Please sign in.");
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { vin },
  });

  if (!vehicle) {
    throw new Error("Vehicle not found.");
  }

  if (vehicle.ownerId !== userId || vehicle.status !== "CLAIMED") {
    throw new Error("Unauthorized: You do not own this claimed vehicle.");
  }

  return { userId, vehicleId: vehicle.id };
}

// ----------------------------------------------------
// PHOTO ACTIONS
// ----------------------------------------------------

export async function uploadVehiclePhoto(vin: string, formData: FormData) {
  const { vehicleId } = await verifyOwnership(vin);

  const file = formData.get("file");
  const caption = formData.get("caption") as string | null;

  if (!isUploadableImageFile(file)) {
    throw new Error("No file provided.");
  }

  const upload = await uploadPublicImage({
    file,
    folder: `vehicles/${vehicleId}/photos`,
  });

  // Check if this is the first photo of the vehicle
  const existingCount = await prisma.vehiclePhoto.count({
    where: { vehicleId },
  });

  await prisma.vehiclePhoto.create({
    data: {
      vehicleId,
      filePath: upload.url,
      caption: caption || null,
      isHero: existingCount === 0, // Mark as hero if it's the first photo
      displayOrder: existingCount,
    },
  });

  safeRevalidatePath(vin);
}

export async function deleteVehiclePhoto(vin: string, photoId: string) {
  const { vehicleId } = await verifyOwnership(vin);

  const photo = await prisma.vehiclePhoto.findUnique({
    where: { id: photoId },
  });

  if (!photo || photo.vehicleId !== vehicleId) {
    throw new Error("Photo not found.");
  }

  await deleteLocalUploadIfPresent(photo.filePath, "photo");

  // Delete from DB
  await prisma.vehiclePhoto.delete({
    where: { id: photoId },
  });

  // If deleted photo was the hero, make another one the hero
  if (photo.isHero) {
    const nextPhoto = await prisma.vehiclePhoto.findFirst({
      where: { vehicleId },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    if (nextPhoto) {
      await prisma.vehiclePhoto.update({
        where: { id: nextPhoto.id },
        data: { isHero: true },
      });
    }
  }

  safeRevalidatePath(vin);
}

export async function setHeroPhoto(vin: string, photoId: string) {
  const { vehicleId } = await verifyOwnership(vin);

  const photo = await prisma.vehiclePhoto.findUnique({
    where: { id: photoId },
  });

  if (!photo || photo.vehicleId !== vehicleId) {
    throw new Error("Photo not found.");
  }

  // Clear hero on all photos and set this one as hero
  await prisma.$transaction([
    prisma.vehiclePhoto.updateMany({
      where: { vehicleId },
      data: { isHero: false },
    }),
    prisma.vehiclePhoto.update({
      where: { id: photoId },
      data: { isHero: true },
    }),
  ]);

  safeRevalidatePath(vin);
}

export async function reorderVehiclePhotos(vin: string, photoIds: string[]) {
  const { vehicleId } = await verifyOwnership(vin);

  await prisma.$transaction(
    photoIds.map((id, index) =>
      prisma.vehiclePhoto.updateMany({
        where: { id, vehicleId },
        data: { displayOrder: index },
      })
    )
  );

  safeRevalidatePath(vin);
}

// ----------------------------------------------------
// DOCUMENT ACTIONS
// ----------------------------------------------------

export async function uploadVehicleDocument(vin: string, formData: FormData) {
  const { vehicleId } = await verifyOwnership(vin);

  const file = formData.get("file");
  const title = formData.get("title") as string | null;
  const documentType = formData.get("documentType") as string | null;

  if (!isUploadableFile(file)) {
    throw new Error("No file provided.");
  }
  if (!title || title.trim() === "") {
    throw new Error("Document title is required.");
  }
  if (!documentType || documentType.trim() === "") {
    throw new Error("Document type is required.");
  }

  const upload = await uploadPublicFile({
    file,
    folder: `vehicles/${vehicleId}/documents`,
  });

  await prisma.vehicleDocument.create({
    data: {
      vehicleId,
      title: title.trim(),
      documentType: documentType.trim(),
      filePath: upload.url,
    },
  });

  safeRevalidatePath(vin);
}

export async function deleteVehicleDocument(vin: string, docId: string) {
  const { vehicleId } = await verifyOwnership(vin);

  const doc = await prisma.vehicleDocument.findUnique({
    where: { id: docId },
  });

  if (!doc || doc.vehicleId !== vehicleId) {
    throw new Error("Document not found.");
  }

  await deleteLocalUploadIfPresent(doc.filePath, "document");

  // Delete from DB
  await prisma.vehicleDocument.delete({
    where: { id: docId },
  });

  safeRevalidatePath(vin);
}

function isUploadableFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

async function deleteLocalUploadIfPresent(filePath: string, label: string) {
  if (!filePath.startsWith("/uploads/")) return;

  const fullPath = path.join(process.cwd(), "public", filePath);
  try {
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  } catch (e) {
    console.error(`Could not delete local ${label} file:`, e);
  }
}
