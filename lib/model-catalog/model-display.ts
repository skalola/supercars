export type DisplayableModelImage = {
  url: string;
  type?: string | null;
  reviewStatus?: string | null;
};

export function isDisplayableModelImage(image: DisplayableModelImage) {
  return image.reviewStatus !== "NEEDS_REVIEW"
    && image.reviewStatus !== "REJECTED"
    && image.type?.toLowerCase() !== "candidate";
}

export function selectModelHeroImage<T extends DisplayableModelImage>(images: T[]) {
  const displayableImages = images.filter((image) => isDisplayableModelImage(image));
  return displayableImages.find((image) => image.type?.toLowerCase() === "hero")
    ?? displayableImages[0]
    ?? null;
}
