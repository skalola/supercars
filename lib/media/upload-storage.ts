import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const PUBLIC_FILE_TYPES = new Set([
  "application/pdf",
  ...IMAGE_TYPES.keys(),
]);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PUBLIC_FILE_BYTES = 12 * 1024 * 1024;

type UploadImageInput = {
  file: File;
  folder: string;
};

export async function uploadPublicImage({ file, folder }: UploadImageInput) {
  validateImageFile(file);
  return uploadPublicFile({ file, folder, maxBytes: MAX_IMAGE_BYTES });
}

export async function uploadPublicFile({
  file,
  folder,
  maxBytes = MAX_PUBLIC_FILE_BYTES,
}: UploadImageInput & { maxBytes?: number }) {
  validatePublicFile(file, maxBytes);
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
}

function validatePublicFile(file: File, maxBytes: number) {
  if (!PUBLIC_FILE_TYPES.has(file.type)) {
    throw new Error("Upload a PDF, JPG, PNG, or WebP file.");
  }
  if (file.size > maxBytes) {
    throw new Error(`Files must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`);
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
  return ["jpg", "jpeg", "png", "webp", "pdf"].includes(extension) ? (extension === "jpeg" ? "jpg" : extension) : "jpg";
}
