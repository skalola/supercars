import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type UploadImageInput = {
  file: File;
  folder: string;
};

export async function uploadPublicImage({ file, folder }: UploadImageInput) {
  validateImageFile(file);

  const extension = IMAGE_TYPES.get(file.type) || getSafeExtension(file.name);
  const filename = `${crypto.randomUUID()}.${extension}`;
  const objectPath = `${sanitizeFolder(folder)}/${filename}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(objectPath, file, {
      access: "public",
      addRandomSuffix: false,
    });
    return {
      url: blob.url,
      provider: "vercel-blob" as const,
      pathname: blob.pathname,
    };
  }

  if (process.env.VERCEL) {
    throw new Error("Image storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const diskPath = path.join(process.cwd(), "public", "uploads", objectPath);
  await fs.mkdir(path.dirname(diskPath), { recursive: true });
  await fs.writeFile(diskPath, bytes);

  return {
    url: `/uploads/${objectPath}`,
    provider: "local" as const,
    pathname: objectPath,
  };
}

export function isUploadableImageFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function validateImageFile(file: File) {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error("Upload a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Images must be 8 MB or smaller.");
  }
}

function sanitizeFolder(value: string) {
  return value
    .split("/")
    .map((part) => part.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, ""))
    .filter(Boolean)
    .join("/");
}

function getSafeExtension(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() || "jpg";
  return ["jpg", "jpeg", "png", "webp"].includes(extension) ? (extension === "jpeg" ? "jpg" : extension) : "jpg";
}
