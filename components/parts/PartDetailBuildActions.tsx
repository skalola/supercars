"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addVehicleInstalledPart } from "@/app/actions/passport";

export type PartDetailGarageCar = {
  id: string;
  vin: string;
  label: string;
  detail: string;
  makeId: string;
  modelId: string;
  imageUrl: string | null;
};

export type PartDetailFitmentOption = {
  makeId: string | null;
  makeName: string | null;
  modelId: string | null;
  modelName: string | null;
  detail: string;
};

type PartDetailBuildActionsProps = {
  partId: string;
  partName: string;
  garageCars: PartDetailGarageCar[];
  fitmentOptions: PartDetailFitmentOption[];
  compatibleMakeIds: string[];
  compatibleModelIds: string[];
};

export function PartDetailBuildActions({
  partId,
  partName,
  garageCars,
  fitmentOptions,
  compatibleMakeIds,
  compatibleModelIds,
}: PartDetailBuildActionsProps) {
  const router = useRouter();
  const [selectedVehicleId, setSelectedVehicleId] = useState(garageCars[0]?.id ?? "");
  const [selectedMakeId, setSelectedMakeId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedVehicle = garageCars.find((car) => car.id === selectedVehicleId) ?? null;

  const makes = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of fitmentOptions) {
      if (option.makeId && option.makeName) map.set(option.makeId, option.makeName);
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [fitmentOptions]);

  const models = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of fitmentOptions) {
      if (option.modelId && option.modelName && (!selectedMakeId || option.makeId === selectedMakeId)) {
        map.set(option.modelId, option.modelName);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [fitmentOptions, selectedMakeId]);

  const garageFitmentStatus = useMemo(() => {
    if (!selectedVehicle) {
      return garageCars.length > 0 ? "Choose a claimed car to add this part to a build." : "Claim a car to add this part to a build.";
    }

    if (compatibleModelIds.includes(selectedVehicle.modelId) || compatibleMakeIds.includes(selectedVehicle.makeId)) {
      return "100% compatible with selected garage car.";
    }

    if (compatibleMakeIds.length === 0 && compatibleModelIds.length === 0) {
      return "Universal or unscoped fitment. Verify before ordering.";
    }

    return "Fitment not confirmed for selected garage car.";
  }, [compatibleMakeIds, compatibleModelIds, garageCars.length, selectedVehicle]);

  const manualFitmentStatus = useMemo(() => {
    if (fitmentOptions.length === 0) return "Universal or unscoped fitment. Verify with the retailer before ordering.";
    if (!selectedMakeId) return "Choose a make to check catalog fitment.";
    if (selectedModelId && compatibleModelIds.includes(selectedModelId)) return "Catalog fitment confirmed for this model.";
    if (compatibleMakeIds.includes(selectedMakeId) && !selectedModelId) return "This make is listed. Choose a model for a tighter check.";
    if (compatibleMakeIds.includes(selectedMakeId)) return "Make fitment is listed, but this model is not confirmed yet.";
    return "Fitment not listed for that make.";
  }, [compatibleMakeIds, compatibleModelIds, fitmentOptions.length, selectedMakeId, selectedModelId]);

  const addToBuild = () => {
    if (!selectedVehicle) {
      setMessage({ type: "error", text: "Choose a claimed vehicle first." });
      return;
    }

    startTransition(async () => {
      try {
        await addVehicleInstalledPart(selectedVehicle.vin, {
          partId,
          notes: `Added from part detail page: ${partName}`,
        });
        setMessage({ type: "success", text: "Added to this vehicle build." });
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
    <div className="part-detail-build-actions">
      <label>
        <span>Fits Your Garage</span>
        <select value={selectedVehicleId} onChange={(event) => setSelectedVehicleId(event.target.value)}>
          {garageCars.length === 0 ? <option value="">No claimed cars yet</option> : null}
          {garageCars.map((car) => (
            <option key={car.id} value={car.id}>
              {car.label}
            </option>
          ))}
        </select>
      </label>
      {selectedVehicle ? (
        <article className="part-detail-selected-car">
          <div>
            {selectedVehicle.imageUrl ? <img src={selectedVehicle.imageUrl} alt="" /> : <span>{selectedVehicle.label.slice(0, 2)}</span>}
          </div>
          <section>
            <strong>{selectedVehicle.label}</strong>
            <small>{selectedVehicle.detail}</small>
          </section>
          <Link href={`/vehicle/${selectedVehicle.vin}`}>Open Build</Link>
        </article>
      ) : null}
      <p className={selectedVehicle ? "is-ready" : ""}>{garageFitmentStatus}</p>

      <details className="part-detail-fitment-drawer">
        <summary>
          <span>Check Other Fitment</span>
          <strong>{`· ${fitmentOptions.length.toLocaleString()} catalog records`}</strong>
        </summary>
        <div className="part-detail-fitment-checker" aria-label="Manual fitment checker">
          <label>
            <span>Check Make</span>
            <select
              value={selectedMakeId}
              onChange={(event) => {
                setSelectedMakeId(event.target.value);
                setSelectedModelId("");
              }}
            >
              <option value="">{makes.length > 0 ? "Choose make" : "Universal / unscoped"}</option>
              {makes.map((make) => (
                <option key={make.id} value={make.id}>
                  {make.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Check Model</span>
            <select value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)} disabled={!selectedMakeId || models.length === 0}>
              <option value="">{selectedMakeId ? "Any listed model" : "Choose make first"}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={manualFitmentStatus.includes("confirmed") ? "is-ready" : ""}>{manualFitmentStatus}</p>
      </details>

      <button type="button" onClick={addToBuild} disabled={isPending || !selectedVehicle}>
        {isPending ? "Adding..." : "Add To Build"}
      </button>
      {!selectedVehicle ? (
        <Link href="/garage" className="part-detail-claim-link">
          Claim a car to save this to a build
        </Link>
      ) : null}
      {message ? <span className={`part-detail-action-message ${message.type}`}>{message.text}</span> : null}
      {message?.type === "success" && selectedVehicle ? (
        <div className="part-detail-success-actions">
          <Link href={`/vehicle/${selectedVehicle.vin}`}>View Build Sheet</Link>
          <Link href={`/parts?make=${selectedVehicle.makeId}&model=${selectedVehicle.modelId}`}>More Compatible Parts</Link>
        </div>
      ) : null}
    </div>
  );
}
