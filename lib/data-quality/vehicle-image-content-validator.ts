import sharp from "sharp";
import { isNonVehicleImageUrl } from "@/lib/vehicle-images";

export type VehicleImageContentStatus =
  | "VALID_CAR_IMAGE"
  | "DOCUMENT_IMAGE"
  | "NON_VEHICLE_IMAGE"
  | "IMAGE_TOO_SMALL"
  | "UNREADABLE_IMAGE";

export type VehicleImageContentMetrics = {
  width: number;
  height: number;
  aspectRatio: number;
  whiteRatio: number;
  darkRatio: number;
  saturatedRatio: number;
  lumaStdDev: number;
};

export type VehicleImageContentValidation = {
  status: VehicleImageContentStatus;
  reason: string;
  metrics?: VehicleImageContentMetrics;
};

const IMAGE_FETCH_HEADERS = {
  accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export async function validateVehicleImageContentFromUrl(
  url: string,
  options: { timeoutMs?: number } = {}
): Promise<VehicleImageContentValidation> {
  if (isNonVehicleImageUrl(url)) {
    return {
      status: "NON_VEHICLE_IMAGE",
      reason: "Image URL matches a known non-vehicle pattern.",
    };
  }

  const buffer = await fetchImageBuffer(url, options.timeoutMs ?? 15000);
  if (!buffer) {
    return {
      status: "UNREADABLE_IMAGE",
      reason: "Image could not be fetched or decoded.",
    };
  }

  return validateVehicleImageContent(buffer, url);
}

export async function validateVehicleImageContent(
  buffer: Buffer,
  url?: string
): Promise<VehicleImageContentValidation> {
  try {
    if (url && isNonVehicleImageUrl(url)) {
      return {
        status: "NON_VEHICLE_IMAGE",
        reason: "Image URL matches a known non-vehicle pattern.",
      };
    }

    const image = sharp(buffer, { failOn: "none" });
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const aspectRatio = width && height ? width / height : 0;

    if (width < 320 || height < 220) {
      return {
        status: "IMAGE_TOO_SMALL",
        reason: "Image is too small to trust as a vehicle listing photo.",
        metrics: emptyMetrics(width, height, aspectRatio),
      };
    }

    const metrics = await calculateImageMetrics(buffer, width, height, aspectRatio);

    if (isDocumentLike(metrics)) {
      return {
        status: "DOCUMENT_IMAGE",
        reason: "Image looks like a document, window sticker, or spec sheet instead of a vehicle photo.",
        metrics,
      };
    }

    return {
      status: "VALID_CAR_IMAGE",
      reason: "Image passed vehicle-photo content checks.",
      metrics,
    };
  } catch {
    return {
      status: "UNREADABLE_IMAGE",
      reason: "Image could not be decoded.",
    };
  }
}

async function fetchImageBuffer(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: IMAGE_FETCH_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.includes("image/")) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function calculateImageMetrics(buffer: Buffer, width: number, height: number, aspectRatio: number) {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .resize(96, 96, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let whitePixels = 0;
  let darkPixels = 0;
  let saturatedPixels = 0;
  let lumaSum = 0;
  let lumaSqSum = 0;
  const totalPixels = info.width * info.height;

  for (let index = 0; index < data.length; index += 3) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    if (red > 235 && green > 235 && blue > 235) whitePixels++;
    if (red < 55 && green < 55 && blue < 55) darkPixels++;
    if (max - min > 45) saturatedPixels++;
    lumaSum += luma;
    lumaSqSum += luma * luma;
  }

  const lumaMean = lumaSum / totalPixels;
  const lumaStdDev = Math.sqrt(Math.max(0, lumaSqSum / totalPixels - lumaMean * lumaMean));

  return {
    width,
    height,
    aspectRatio,
    whiteRatio: whitePixels / totalPixels,
    darkRatio: darkPixels / totalPixels,
    saturatedRatio: saturatedPixels / totalPixels,
    lumaStdDev,
  };
}

function isDocumentLike(metrics: VehicleImageContentMetrics) {
  const lowColor = metrics.saturatedRatio < 0.06;
  const mostlyWhite = metrics.whiteRatio > 0.62;
  const veryWhite = metrics.whiteRatio > 0.72;
  const lowContrast = metrics.lumaStdDev < 42;
  const documentAspect = metrics.aspectRatio > 0.65 && metrics.aspectRatio < 1.15;

  return (
    (mostlyWhite && lowColor && lowContrast) ||
    (veryWhite && lowColor) ||
    (documentAspect && metrics.whiteRatio > 0.55 && metrics.saturatedRatio < 0.04)
  );
}

function emptyMetrics(width: number, height: number, aspectRatio: number): VehicleImageContentMetrics {
  return {
    width,
    height,
    aspectRatio,
    whiteRatio: 0,
    darkRatio: 0,
    saturatedRatio: 0,
    lumaStdDev: 0,
  };
}
