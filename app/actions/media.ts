"use server";

import { auth } from "@/auth";
import { deleteStoredFile, isUploadableImageFile, uploadPrivateFile, uploadPublicImage } from "@/lib/media/upload-storage";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { enforceActionRateLimit } from "@/lib/security/action-rate-limit";
import { vinClaimSchema } from "@/lib/validation/transaction-inputs";
import {
  mediaRecordIdSchema,
  uploadedVehiclePhotoSchema,
  vehicleDocumentMetadataSchema,
  vehiclePhotoMetadataSchema,
  vehiclePhotoOrderSchema,
} from "@/lib/validation/media-inputs";

function safeRevalidatePath(vin: string) {
  try {
    revalidatePath(`/vehicle/${vin}`);
    revalidatePath(`/vehicle/${vin}/edit`);
    revalidatePath("/garage");
  } catch {
    // Ignore in non-HTTP-request scope
  }
}

async function verifyOwnership(vin: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: Please sign in.");
  }

  const validatedVin = vinClaimSchema.parse(vin);
  const vehicle = await prisma.vehicle.findUnique({
    where: { vin: validatedVin },
    select: {
      id: true,
      ownerId: true,
      status: true,
    },
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
  const { userId, vehicleId } = await verifyOwnership(vin);
  await enforceActionRateLimit({
    actorId: userId,
    action: "vehicle_upload",
    bucketKey: vehicleId,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });

  const file = formData.get("file");
  const { caption } = vehiclePhotoMetadataSchema.parse({ caption: String(formData.get("caption") || "") });

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
      caption,
      isHero: existingCount === 0, // Mark as hero if it's the first photo
      displayOrder: existingCount,
    },
  });

  safeRevalidatePath(vin);
}

export async function registerUploadedVehiclePhoto(
  vin: string,
  input: { url: string; pathname: string; caption?: string },
) {
  const { userId, vehicleId } = await verifyOwnership(vin);
  await enforceActionRateLimit({
    actorId: userId,
    action: "vehicle_upload",
    bucketKey: vehicleId,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  const upload = uploadedVehiclePhotoSchema.parse(input);
  const expectedPrefix = `vehicles/${vehicleId}/photos/`;
  if (!upload.pathname.startsWith(expectedPrefix)) {
    throw new Error("The uploaded photo does not belong to this vehicle.");
  }

  const uploadUrl = new URL(upload.url);
  const decodedPathname = decodeURIComponent(uploadUrl.pathname).replace(/^\//, "");
  if (!uploadUrl.hostname.endsWith(".blob.vercel-storage.com") || decodedPathname !== upload.pathname) {
    throw new Error("The uploaded photo location is invalid.");
  }

  const existingCount = await prisma.vehiclePhoto.count({ where: { vehicleId } });
  if (existingCount >= 100) {
    await deleteStoredFile(upload.url).catch(() => undefined);
    throw new Error("This vehicle gallery already contains the maximum of 100 photos.");
  }

  try {
    await prisma.vehiclePhoto.create({
      data: {
        vehicleId,
        filePath: upload.url,
        caption: upload.caption,
        isHero: existingCount === 0,
        displayOrder: existingCount,
      },
    });
  } catch (error) {
    await deleteStoredFile(upload.url).catch(() => undefined);
    throw error;
  }

  safeRevalidatePath(vin);
}

export async function deleteVehiclePhoto(vin: string, photoId: string) {
  const { vehicleId } = await verifyOwnership(vin);
  photoId = mediaRecordIdSchema.parse(photoId);

  const photo = await prisma.vehiclePhoto.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      vehicleId: true,
      filePath: true,
      isHero: true,
    },
  });

  if (!photo || photo.vehicleId !== vehicleId) {
    throw new Error("Photo not found.");
  }

  await deleteStoredFile(photo.filePath);

  // Delete from DB
  await prisma.vehiclePhoto.delete({
    where: { id: photoId },
  });

  // If deleted photo was the hero, make another one the hero
  if (photo.isHero) {
    const nextPhoto = await prisma.vehiclePhoto.findFirst({
      where: { vehicleId },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
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
  photoId = mediaRecordIdSchema.parse(photoId);

  const photos = await prisma.vehiclePhoto.findMany({
    where: { vehicleId },
    select: { id: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  const photo = photos.find((item) => item.id === photoId);

  if (!photo) {
    throw new Error("Photo not found.");
  }

  const orderedIds = [photoId, ...photos.filter((item) => item.id !== photoId).map((item) => item.id)];
  await persistVehiclePhotoOrder(vehicleId, orderedIds);

  safeRevalidatePath(vin);
}

export async function reorderVehiclePhotos(vin: string, photoIds: string[]) {
  const { vehicleId } = await verifyOwnership(vin);
  photoIds = vehiclePhotoOrderSchema.parse(photoIds);

  const existingPhotos = await prisma.vehiclePhoto.findMany({
    where: { vehicleId },
    select: { id: true },
  });
  const existingIds = new Set(existingPhotos.map((photo) => photo.id));
  const submittedIds = new Set(photoIds);
  if (
    photoIds.length !== existingPhotos.length ||
    submittedIds.size !== photoIds.length ||
    photoIds.some((id) => !existingIds.has(id))
  ) {
    throw new Error("Photo order is out of date. Refresh and try again.");
  }

  await persistVehiclePhotoOrder(vehicleId, photoIds);

  safeRevalidatePath(vin);
}

async function persistVehiclePhotoOrder(vehicleId: string, photoIds: string[]) {
  await prisma.$transaction([
    prisma.vehiclePhoto.updateMany({
      where: { vehicleId },
      data: { isHero: false },
    }),
    ...photoIds.map((id, index) =>
      prisma.vehiclePhoto.updateMany({
        where: { id, vehicleId },
        data: { displayOrder: index, isHero: index === 0 },
      })
    ),
  ]);
}

// ----------------------------------------------------
// DOCUMENT ACTIONS
// ----------------------------------------------------

export async function uploadVehicleDocument(vin: string, formData: FormData) {
  const { userId, vehicleId } = await verifyOwnership(vin);
  await enforceActionRateLimit({
    actorId: userId,
    action: "vehicle_upload",
    bucketKey: vehicleId,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });

  const file = formData.get("file");
  const metadata = vehicleDocumentMetadataSchema.parse({
    title: String(formData.get("title") || ""),
    documentType: String(formData.get("documentType") || ""),
  });

  if (!isUploadableFile(file)) {
    throw new Error("No file provided.");
  }
  const upload = await uploadPrivateFile({
    file,
    folder: `vehicles/${vehicleId}/documents`,
  });

  await prisma.vehicleDocument.create({
    data: {
      vehicleId,
      title: metadata.title,
      documentType: metadata.documentType,
      filePath: upload.url,
    },
  });

  safeRevalidatePath(vin);
}

export async function deleteVehicleDocument(vin: string, docId: string) {
  const { vehicleId } = await verifyOwnership(vin);
  docId = mediaRecordIdSchema.parse(docId);

  const doc = await prisma.vehicleDocument.findUnique({
    where: { id: docId },
    select: {
      id: true,
      vehicleId: true,
      filePath: true,
    },
  });

  if (!doc || doc.vehicleId !== vehicleId) {
    throw new Error("Document not found.");
  }

  await deleteStoredFile(doc.filePath);

  // Delete from DB
  await prisma.vehicleDocument.delete({
    where: { id: docId },
  });

  safeRevalidatePath(vin);
}

function isUploadableFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}
