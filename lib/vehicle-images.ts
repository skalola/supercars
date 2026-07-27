export interface VehicleImageInput {
  photos?: Array<{ filePath: string; isHero: boolean }> | null;
  images?: Array<{ url: string; isPrimary: boolean; validationStatus?: string | null }> | null;
  model?: {
    images?: Array<{ url: string; type: string | null }> | null;
  } | null;
}

/**
 * Resolves the best available hero image for a vehicle based on the priority chain:
 * 1. Owner-uploaded primary vehicle image (isHero === true, or first available photo)
 * 2. Primary marketplace listing image (isPrimary === true)
 * 3. First available listing image
 * 4. Model default image (type === "hero", or first available model image)
 * 5. Generic placeholder (/images/placeholder.jpg)
 */
export function getVehicleHeroImage(vehicle: VehicleImageInput | null | undefined): string {
  if (!vehicle) {
    return "/images/placeholder.jpg";
  }

  // Priority 1: Owner-uploaded primary vehicle image
  if (vehicle.photos && vehicle.photos.length > 0) {
    const primaryPhoto = vehicle.photos.find((p) => p.isHero) || vehicle.photos[0];
    if (primaryPhoto?.filePath) {
      return primaryPhoto.filePath;
    }
  }

  // Priority 2: Primary marketplace listing image
  if (vehicle.images && vehicle.images.length > 0) {
    const validImages = vehicle.images.filter(
      (img) => img.validationStatus !== "IMAGE_UNVERIFIED" && img.validationStatus !== "IMAGE_MISMATCH"
    );
    const primaryImg = validImages.find((img) => img.isPrimary);
    if (primaryImg?.url) {
      return primaryImg.url;
    }
  }

  // Priority 3: First available listing image
  if (vehicle.images && vehicle.images.length > 0) {
    const validImages = vehicle.images.filter(
      (img) => img.validationStatus !== "IMAGE_UNVERIFIED" && img.validationStatus !== "IMAGE_MISMATCH"
    );
    const firstImg = validImages[0];
    if (firstImg?.url) {
      return firstImg.url;
    }
  }

  // Priority 4: Model default image
  if (vehicle.model?.images && vehicle.model.images.length > 0) {
    const modelHero = vehicle.model.images.find((img) => img.type === "hero") || vehicle.model.images[0];
    if (modelHero?.url) {
      return modelHero.url;
    }
  }

  // Priority 5: Generic placeholder
  return "/images/placeholder.jpg";
}
