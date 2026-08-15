import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

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
const PRIVATE_BLOB_PREFIX = "private-blob:";
const PRIVATE_LOCAL_PREFIX = "private-local:";

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

export async function uploadPrivateFile({
  file,
  folder,
  maxBytes = MAX_PUBLIC_FILE_BYTES,
}: UploadImageInput & { maxBytes?: number }) {
  validatePublicFile(file, maxBytes);
  const extension = IMAGE_TYPES.get(file.type) || getSafeExtension(file.name);
  const filename = `${crypto.randomUUID()}.${extension}`;
  const objectPath = `${sanitizeFolder(folder)}/${filename}`;

  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN) {
    const blob = await put(objectPath, file, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.type,
      cacheControlMaxAge: 60,
    });
    return {
      url: `${PRIVATE_BLOB_PREFIX}${blob.pathname}`,
      provider: "vercel-blob-private" as const,
      pathname: blob.pathname,
    };
  }

  if (process.env.VERCEL) {
    throw new Error("Private document storage is not configured.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const diskPath = getPrivateLocalPath(objectPath);
  await fs.mkdir(path.dirname(diskPath), { recursive: true });
  await fs.writeFile(diskPath, bytes, { mode: 0o600 });

  return {
    url: `${PRIVATE_LOCAL_PREFIX}${objectPath}`,
    provider: "local-private" as const,
    pathname: objectPath,
  };
}

export async function readPrivateFile(filePath: string) {
  if (filePath.startsWith(PRIVATE_BLOB_PREFIX)) {
    const pathname = filePath.slice(PRIVATE_BLOB_PREFIX.length);
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return {
      body: result.stream,
      contentType: result.blob.contentType,
      size: result.blob.size,
      extension: getSafeExtension(result.blob.pathname),
    };
  }

  if (filePath.startsWith(PRIVATE_LOCAL_PREFIX)) {
    const pathname = filePath.slice(PRIVATE_LOCAL_PREFIX.length);
    const bytes = await fs.readFile(getPrivateLocalPath(pathname)).catch(() => null);
    if (!bytes) return null;
    return {
      body: bytes,
      contentType: getContentType(pathname),
      size: bytes.byteLength,
      extension: getSafeExtension(pathname),
    };
  }

  return readLegacyPublicFile(filePath);
}

export async function deleteStoredFile(filePath: string) {
  if (filePath.startsWith(PRIVATE_BLOB_PREFIX)) {
    await del(filePath.slice(PRIVATE_BLOB_PREFIX.length));
    return;
  }

  if (filePath.startsWith(PRIVATE_LOCAL_PREFIX)) {
    await fs.unlink(getPrivateLocalPath(filePath.slice(PRIVATE_LOCAL_PREFIX.length))).catch(() => undefined);
    return;
  }

  if (filePath.startsWith("/uploads/")) {
    const diskPath = path.resolve(process.cwd(), "public", filePath.slice(1));
    const publicRoot = path.resolve(process.cwd(), "public", "uploads");
    if (diskPath.startsWith(`${publicRoot}${path.sep}`)) {
      await fs.unlink(diskPath).catch(() => undefined);
    }
    return;
  }

  try {
    const url = new URL(filePath);
    if (url.hostname.endsWith(".blob.vercel-storage.com")) {
      await del(url.toString());
    }
  } catch {
    // Unknown legacy paths are intentionally left untouched.
  }
}

export function isPrivateStoredFile(filePath: string) {
  return filePath.startsWith(PRIVATE_BLOB_PREFIX) || filePath.startsWith(PRIVATE_LOCAL_PREFIX);
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

function getPrivateLocalPath(objectPath: string) {
  const root = path.join(process.cwd(), ".private-uploads");
  const resolved = path.resolve(root, objectPath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid private file path.");
  }
  return resolved;
}

async function readLegacyPublicFile(filePath: string) {
  if (filePath.startsWith("/uploads/")) {
    const diskPath = path.resolve(process.cwd(), "public", filePath.slice(1));
    const publicRoot = path.resolve(process.cwd(), "public", "uploads");
    if (!diskPath.startsWith(`${publicRoot}${path.sep}`)) return null;
    const bytes = await fs.readFile(diskPath).catch(() => null);
    if (!bytes) return null;
    return {
      body: bytes,
      contentType: getContentType(filePath),
      size: bytes.byteLength,
      extension: getSafeExtension(filePath),
    };
  }

  let url: URL;
  try {
    url = new URL(filePath);
  } catch {
    return null;
  }
  if (!url.hostname.endsWith(".blob.vercel-storage.com")) return null;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || !response.body) return null;
  return {
    body: response.body,
    contentType: response.headers.get("content-type") || getContentType(url.pathname),
    size: Number(response.headers.get("content-length")) || undefined,
    extension: getSafeExtension(url.pathname),
  };
}

function getContentType(filename: string) {
  const extension = getSafeExtension(filename);
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}
