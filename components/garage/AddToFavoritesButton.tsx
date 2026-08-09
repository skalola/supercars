"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleGarageItem } from "@/app/actions/garage";

type AddToFavoritesButtonProps = {
  modelId: string;
  initialSaved: boolean;
};

export function AddToFavoritesButton({ modelId, initialSaved }: AddToFavoritesButtonProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  function toggleFavorite() {
    setSaved((current) => !current);
    startTransition(async () => {
      const result = await toggleGarageItem(modelId);
      if (!result.ok) {
        setSaved((current) => !current);
        if (result.reason === "unauthenticated") router.push("/login");
        return;
      }
      setSaved(Boolean(result.saved));
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className={`vehicle-favorite-button${saved ? " is-saved" : ""}`}
      onClick={toggleFavorite}
      disabled={isPending}
    >
      <span aria-hidden="true">{saved ? "✓" : "+"}</span>
      {saved ? "Saved" : "Add to favorites"}
    </button>
  );
}
