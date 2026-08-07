"use client";

import { useMemo, useState } from "react";

export type VehicleGalleryImage = {
  id: string;
  src: string;
  alt: string;
  caption?: string | null;
};

type VehiclePhotoGalleryProps = {
  title?: string;
  images: VehicleGalleryImage[];
  initialImageSrc?: string | null;
};

export default function VehiclePhotoGallery({
  title = "Vehicle Photos",
  images,
  initialImageSrc,
}: VehiclePhotoGalleryProps) {
  const normalizedImages = useMemo(() => {
    const seen = new Set<string>();
    return images.filter((image) => {
      if (!image.src || seen.has(image.src)) return false;
      seen.add(image.src);
      return true;
    });
  }, [images]);

  const initialImage =
    normalizedImages.find((image) => image.src === initialImageSrc) ||
    normalizedImages[0] ||
    null;
  const [selectedSrc, setSelectedSrc] = useState(initialImage?.src || "");
  const selectedImage =
    normalizedImages.find((image) => image.src === selectedSrc) ||
    initialImage;

  if (!selectedImage) return null;

  return (
    <section className="vehicle-photo-gallery">
      <div className="vehicle-photo-gallery-header">
        <h2>{title}</h2>
        {normalizedImages.length > 1 ? (
          <span>{normalizedImages.length} photos</span>
        ) : null}
      </div>

      <div className="vehicle-photo-gallery-main">
        <img src={selectedImage.src} alt={selectedImage.alt} />
        {selectedImage.caption ? (
          <div className="vehicle-photo-gallery-caption">{selectedImage.caption}</div>
        ) : null}
      </div>

      {normalizedImages.length > 1 ? (
        <div className="vehicle-photo-gallery-thumbs" aria-label="Vehicle photo thumbnails">
          {normalizedImages.map((image, index) => {
            const isSelected = image.src === selectedImage.src;

            return (
              <button
                key={image.id}
                type="button"
                className={isSelected ? "is-selected" : ""}
                aria-label={`Show photo ${index + 1}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedSrc(image.src)}
              >
                <img src={image.src} alt="" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
