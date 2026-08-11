"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

export type PartDetailGalleryImage = {
  id: string;
  src: string;
  alt: string;
  label: string;
  tone?: "product" | "brand";
};

type PartDetailGalleryProps = {
  images: PartDetailGalleryImage[];
  fallbackLabel: string;
};

export function PartDetailGallery({ images, fallbackLabel }: PartDetailGalleryProps) {
  const cleanImages = useMemo(() => dedupeImages(images), [images]);
  const [activeImageId, setActiveImageId] = useState(cleanImages[0]?.id ?? "");
  const activeImage = cleanImages.find((image) => image.id === activeImageId) ?? cleanImages[0] ?? null;

  return (
    <div className="part-detail-gallery">
      <div className={`part-detail-media${activeImage?.tone === "brand" ? " is-brand-media" : " is-source-media"}`}>
        {activeImage ? (
          <img src={activeImage.src} alt={activeImage.alt} />
        ) : (
          <span>{fallbackLabel}</span>
        )}
      </div>

      {cleanImages.length > 1 ? (
        <div className="part-detail-thumbnail-row" aria-label="Part image previews">
          {cleanImages.map((image) => (
            <button
              key={image.id}
              type="button"
              className={image.id === activeImage?.id ? "is-active" : ""}
              onClick={() => setActiveImageId(image.id)}
              aria-label={`Show ${image.label}`}
            >
              <img src={image.src} alt="" />
            </button>
          ))}
        </div>
      ) : cleanImages.length === 0 ? (
        <div className="part-detail-thumbnail-row" aria-label="Part image previews">
          <div>
            <span>{fallbackLabel}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function dedupeImages(images: PartDetailGalleryImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    const src = image.src.trim();
    if (!src || seen.has(src)) return false;
    seen.add(src);
    return true;
  });
}
