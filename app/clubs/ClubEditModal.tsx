"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export default function ClubEditModal({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <>
      <button type="button" className="club-edit-button" onClick={() => setIsOpen(true)}>
        Edit Club
      </button>
      {isOpen ? (
        <div className="club-edit-modal" role="dialog" aria-modal="true" aria-label="Edit club">
          <button type="button" className="club-edit-modal-backdrop" aria-label="Close editor" onClick={() => setIsOpen(false)} />
          <section className="club-edit-modal-panel">
            <header className="club-edit-modal-header">
              <div>
                <span>Moderator Tools</span>
                <strong>Edit Club</strong>
              </div>
              <button type="button" aria-label="Close editor" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </header>
            <div className="club-edit-modal-content">{children}</div>
          </section>
        </div>
      ) : null}
    </>
  );
}
