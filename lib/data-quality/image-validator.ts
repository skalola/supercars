export type ImageValidationStatus = "VALID_IMAGE" | "IMAGE_UNVERIFIED" | "IMAGE_MISMATCH";

/**
 * Validates image verification status to prevent mismatched media from rendering.
 */
export function validateImage(
  imageUrl: string | null,
  validationStatus: string | null
): ImageValidationStatus {
  if (!imageUrl) return "IMAGE_UNVERIFIED";
  if (validationStatus === "IMAGE_UNVERIFIED") return "IMAGE_UNVERIFIED";
  if (validationStatus === "IMAGE_MISMATCH") return "IMAGE_MISMATCH";
  return "VALID_IMAGE";
}
