"use client";

import { useEffect, useRef, useState } from "react";

export default function GarageShareMenu({ username, displayName }: { username: string; displayName: string }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeFromOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, []);

  return (
    <div ref={menuRef} className={`garage-share-menu${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="garage-profile-secondary-button garage-share-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setFeedback("");
          setOpen((current) => !current);
        }}
      >
        Share
        <span aria-hidden="true" />
      </button>
      <div className="garage-share-dropdown" role="menu" aria-label="Share Garage">
        <button type="button" role="menuitem" onClick={() => share("garage")}>Share Garage</button>
        <button type="button" role="menuitem" onClick={() => share("parts")}>Share Parts Store</button>
      </div>
      {feedback ? <span className="garage-share-feedback" role="status">{feedback}</span> : null}
    </div>
  );

  async function share(target: "garage" | "parts") {
    const garagePath = `/garage/${encodeURIComponent(username)}`;
    const path = target === "parts" ? `${garagePath}?tab=partsForSale#garage-collection` : garagePath;
    const url = new URL(path, window.location.origin).toString();
    const title = target === "parts" ? `${displayName}'s Parts Store` : `${displayName}'s Garage`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `View ${title} on SUPERCAR DASH.`, url });
        setFeedback("Shared");
      } else {
        await navigator.clipboard.writeText(url);
        setFeedback("Link copied");
      }
      setOpen(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedback("Could not share link");
    }
  }
}
