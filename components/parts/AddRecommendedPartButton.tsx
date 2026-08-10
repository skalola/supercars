"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addVehicleInstalledPart } from "@/app/actions/passport";

type AddRecommendedPartButtonProps = {
  vin: string;
  partId: string;
  partName: string;
};

export function AddRecommendedPartButton({ vin, partId, partName }: AddRecommendedPartButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const addPart = () => {
    startTransition(async () => {
      try {
        await addVehicleInstalledPart(vin, {
          partId,
          notes: `Added from recommended upgrades: ${partName}`,
        });
        setMessage({ type: "success", text: "Added to this vehicle." });
        router.refresh();
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Could not add this part.",
        });
      }
    });
  };

  return (
    <div className="vehicle-add-part-control">
      <button type="button" onClick={addPart} disabled={isPending}>
        {isPending ? "Adding" : "Add To Vehicle"}
      </button>
      {message ? <span className={message.type}>{message.text}</span> : null}
    </div>
  );
}
