"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAX_LOGO_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 800;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Point = { x: number; y: number };
type ImageSize = { width: number; height: number };

export default function ClubLogoCropField({ initialLogoUrl }: { initialLogoUrl?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cropAreaRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialLogoUrl || null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      setImageSize(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = null;
      setSourceUrl(null);
      if (inputRef.current) inputRef.current.value = "";
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function releaseSourceUrl() {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = null;
    setSourceUrl(null);
  }

  function closeCropper() {
    setIsOpen(false);
    setImageSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    releaseSourceUrl();
  }

  function cancelCropper() {
    if (inputRef.current) inputRef.current.value = "";
    closeCropper();
  }

  function chooseFile() {
    setError(null);
    inputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Club logos must be 8 MB or smaller.");
      event.target.value = "";
      return;
    }

    releaseSourceUrl();
    const nextSourceUrl = URL.createObjectURL(file);
    sourceUrlRef.current = nextSourceUrl;
    setSourceUrl(nextSourceUrl);
    setImageSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    setIsOpen(true);
  }

  function getOffsetLimits(nextZoom = zoom) {
    const cropSize = cropAreaRef.current?.clientWidth || 300;
    if (!imageSize) return { x: 0, y: 0 };
    const baseScale = Math.max(cropSize / imageSize.width, cropSize / imageSize.height);
    return {
      x: Math.max(0, (imageSize.width * baseScale * nextZoom - cropSize) / 2),
      y: Math.max(0, (imageSize.height * baseScale * nextZoom - cropSize) / 2),
    };
  }

  function clampOffset(point: Point, nextZoom = zoom) {
    const limits = getOffsetLimits(nextZoom);
    return {
      x: Math.max(-limits.x, Math.min(limits.x, point.x)),
      y: Math.max(-limits.y, Math.min(limits.y, point.y)),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!imageSize) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(clampOffset({
      x: drag.origin.x + event.clientX - drag.start.x,
      y: drag.origin.y + event.clientY - drag.start.y,
    }));
  }

  function stopDragging(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function handleCropKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const movement: Record<string, Point> = {
      ArrowLeft: { x: -4, y: 0 },
      ArrowRight: { x: 4, y: 0 },
      ArrowUp: { x: 0, y: -4 },
      ArrowDown: { x: 0, y: 4 },
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    setOffset((current) => clampOffset({ x: current.x + delta.x, y: current.y + delta.y }));
  }

  function handleZoomChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextZoom = Number(event.target.value);
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, nextZoom));
  }

  async function applyCrop() {
    const image = imageRef.current;
    const cropArea = cropAreaRef.current;
    const input = inputRef.current;
    if (!image || !cropArea || !input || !imageSize) return;

    setIsCropping(true);
    setError(null);
    try {
      const cropSize = cropArea.clientWidth;
      const baseScale = Math.max(cropSize / imageSize.width, cropSize / imageSize.height);
      const renderedScale = baseScale * zoom;
      const sourceSize = cropSize / renderedScale;
      const sourceX = imageSize.width / 2 - offset.x / renderedScale - sourceSize / 2;
      const sourceY = imageSize.height / 2 - offset.y / renderedScale - sourceSize / 2;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot prepare the club logo.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not prepare the club logo.")), "image/png");
      });
      const croppedFile = new File([blob], "club-logo.png", { type: "image/png" });
      const transfer = new DataTransfer();
      transfer.items.add(croppedFile);
      input.files = transfer.files;

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const nextPreviewUrl = URL.createObjectURL(croppedFile);
      previewUrlRef.current = nextPreviewUrl;
      setPreviewUrl(nextPreviewUrl);
      closeCropper();
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : "Could not prepare the club logo.");
    } finally {
      setIsCropping(false);
    }
  }

  return (
    <div className="club-logo-upload-field">
      <span className="club-logo-upload-label">Club Logo</span>
      <div className="club-logo-upload-control">
        <span className="club-logo-upload-preview">
          {previewUrl ? <img src={previewUrl} alt="Club logo preview" /> : <span aria-hidden="true">+</span>}
        </span>
        <div>
          <button type="button" onClick={chooseFile}>{previewUrl ? "Change Logo" : "Choose Logo"}</button>
          <small>Square JPG, PNG, or WebP. Maximum 8 MB.</small>
        </div>
      </div>
      <input
        ref={inputRef}
        className="sr-only"
        name="logoFile"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
      />
      {error ? <p className="club-logo-upload-error" role="alert">{error}</p> : null}

      {isOpen && sourceUrl ? createPortal(
        <div className="club-logo-crop-modal" role="dialog" aria-modal="true" aria-label="Crop club logo">
          <button type="button" className="club-logo-crop-backdrop" aria-label="Cancel logo crop" onClick={cancelCropper} />
          <section className="club-logo-crop-panel">
            <header>
              <div>
                <span>Club Badge</span>
                <strong>Choose the visible area</strong>
              </div>
              <button type="button" className="club-logo-crop-close" onClick={cancelCropper} aria-label="Close logo cropper">×</button>
            </header>
            <div className="club-logo-crop-workspace">
              <div
                ref={cropAreaRef}
                className="club-logo-crop-area"
                tabIndex={0}
                aria-label="Drag the image to reposition it. Use arrow keys for precise adjustments."
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDragging}
                onPointerCancel={stopDragging}
                onKeyDown={handleCropKeyDown}
              >
                <div className="club-logo-crop-image-position" style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}>
                  <img
                    ref={imageRef}
                    src={sourceUrl}
                    alt=""
                    draggable={false}
                    style={{ transform: `scale(${zoom})` }}
                    onLoad={(event) => setImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })}
                  />
                </div>
                <span className="club-logo-crop-guide" aria-hidden="true" />
              </div>
              <p>Drag to position the badge. Keep important artwork inside the circular guide.</p>
              {error ? <p className="club-logo-upload-error" role="alert">{error}</p> : null}
              <label className="club-logo-zoom-control">
                <span>Zoom</span>
                <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={handleZoomChange} />
                <strong>{Math.round(zoom * 100)}%</strong>
              </label>
            </div>
            <footer>
              <button type="button" className="club-logo-crop-cancel" onClick={cancelCropper}>Cancel</button>
              <button type="button" className="club-logo-crop-apply" onClick={applyCrop} disabled={!imageSize || isCropping}>
                {isCropping ? "Preparing..." : "Use Logo"}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
