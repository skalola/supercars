const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const ACCEPTED_INPUT_TYPES = new Set(["image/jpeg", "image/png", ...HEIC_TYPES]);
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 2400;

export type PreparedVehiclePhoto = {
  file: File;
  convertedFromHeic: boolean;
};

export function isAcceptedVehiclePhoto(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ACCEPTED_INPUT_TYPES.has(file.type.toLowerCase()) ||
    ["jpg", "jpeg", "png", "heic", "heif"].includes(extension || "");
}

export async function prepareVehiclePhoto(file: File): Promise<PreparedVehiclePhoto> {
  if (!isAcceptedVehiclePhoto(file)) {
    throw new Error(`${file.name} is not a JPG, JPEG, PNG, HEIC, or HEIF image.`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`${file.name} is larger than 30 MB. Choose a smaller photo.`);
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  const isHeic = HEIC_TYPES.has(file.type.toLowerCase()) || extension === "heic" || extension === "heif";
  let source: Blob = file;

  if (isHeic) {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    source = Array.isArray(converted) ? converted[0] : converted;
  }

  const output = await resizeAsJpeg(source, MAX_DIMENSION, 0.88);
  if (output.size > MAX_OUTPUT_BYTES) {
    throw new Error(`${file.name} could not be reduced below 8 MB. Choose a smaller photo.`);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "vehicle-photo";
  return {
    file: new File([output], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() }),
    convertedFromHeic: isHeic,
  };
}

async function resizeAsJpeg(source: Blob, maxDimension: number, quality: number): Promise<Blob> {
  const image = await loadImage(source);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the selected photo.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image.element, 0, 0, width, height);
  image.cleanup();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("This browser could not convert the selected photo.")),
      "image/jpeg",
      quality,
    );
  });
}

async function loadImage(source: Blob): Promise<{
  width: number;
  height: number;
  element: CanvasImageSource;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    return {
      width: bitmap.width,
      height: bitmap.height,
      element: bitmap,
      cleanup: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(source);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  await image.decode();
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    element: image,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  };
}
