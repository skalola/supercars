"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { MakeOption, ModelEditorOption } from "@/lib/makes/catalog";
import { fetchCatalogModels } from "@/lib/makes/client";

export default function ClubModelSelector({
  makes,
  initialModels = [],
  initialModelIds = [],
}: {
  makes: MakeOption[];
  initialModels?: ModelEditorOption[];
  initialModelIds?: string[];
}) {
  const [openMenu, setOpenMenu] = useState<"make" | "model" | null>(null);
  const [models, setModels] = useState<ModelEditorOption[]>(initialModels);
  const [loadedMakeIds, setLoadedMakeIds] = useState<Set<string>>(() => new Set());
  const [modelLoadState, setModelLoadState] = useState<"idle" | "loading" | "error">("idle");
  const modelRequestRef = useRef(0);
  const [selectedMakeIds, setSelectedMakeIds] = useState<Set<string>>(
    () => new Set(initialModels.filter((model) => initialModelIds.includes(model.id)).map((model) => model.makeId)),
  );
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set(initialModelIds));
  const makeNamesById = new Map(makes.map((make) => [make.id, make.name]));

  const sortedMakes = [...makes].sort((a, b) => a.name.localeCompare(b.name));
  const availableModels = selectedMakeIds.size > 0
    ? models
        .filter((model) => selectedMakeIds.has(model.makeId))
        .sort((a, b) =>
          (makeNamesById.get(a.makeId) || "").localeCompare(makeNamesById.get(b.makeId) || "") ||
          a.name.localeCompare(b.name)
        )
    : [];
  const availableModelIds = new Set(availableModels.map((model) => model.id));
  const selectedVisibleModelCount = [...selectedModelIds].filter((modelId) => availableModelIds.has(modelId)).length;
  const allMakesSelected = sortedMakes.length > 0 && selectedMakeIds.size === sortedMakes.length;
  const allModelsSelected = availableModels.length > 0 && selectedVisibleModelCount === availableModels.length;
  const makeSummary = allMakesSelected
    ? "All makes selected"
    : selectedMakeIds.size > 0
      ? `${selectedMakeIds.size} ${selectedMakeIds.size === 1 ? "make" : "makes"} selected`
      : "All or selected makes";
  const modelSummary = selectedMakeIds.size === 0
    ? "Choose make first"
    : modelLoadState === "loading"
      ? "Loading models..."
    : allModelsSelected
    ? "All models selected"
    : selectedVisibleModelCount > 0
      ? `${selectedVisibleModelCount} ${selectedVisibleModelCount === 1 ? "model" : "models"} selected`
      : "All or selected models";

  async function loadModels(makeIds: string[]) {
    const missingMakeIds = makeIds.filter((makeId) => !loadedMakeIds.has(makeId));
    if (missingMakeIds.length === 0) return;
    const requestId = ++modelRequestRef.current;
    setModelLoadState("loading");
    try {
      const rows = await fetchCatalogModels(missingMakeIds);
      setModels((current) => {
        const byId = new Map(current.map((model) => [model.id, model]));
        for (const model of rows) byId.set(model.id, model);
        return [...byId.values()];
      });
      setLoadedMakeIds((current) => new Set([...current, ...missingMakeIds]));
      if (modelRequestRef.current === requestId) setModelLoadState("idle");
    } catch {
      if (modelRequestRef.current === requestId) setModelLoadState("error");
    }
  }

  function toggleMake(makeId: string) {
    const isRemovingMake = selectedMakeIds.has(makeId);
    setSelectedMakeIds((current) => {
      const next = new Set(current);
      if (next.has(makeId)) {
        next.delete(makeId);
      } else {
        next.add(makeId);
      }
      return next;
    });
    if (isRemovingMake) {
      const modelIdsForMake = new Set(models.filter((model) => model.makeId === makeId).map((model) => model.id));
      setSelectedModelIds((selectedModels) => {
        const updatedModels = new Set(selectedModels);
        modelIdsForMake.forEach((modelId) => updatedModels.delete(modelId));
        return updatedModels;
      });
    }
  }

  function toggleAllMakes() {
    setSelectedMakeIds((current) => {
      if (current.size === sortedMakes.length) {
        setSelectedModelIds(new Set());
        return new Set();
      }
      return new Set(sortedMakes.map((make) => make.id));
    });
  }

  function toggleModel(modelId: string) {
    setSelectedModelIds((current) => {
      const next = new Set(current);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  }

  function toggleAllModels() {
    setSelectedModelIds((current) => {
      const next = new Set(current);
      if (allModelsSelected) {
        availableModels.forEach((model) => next.delete(model.id));
      } else {
        availableModels.forEach((model) => next.add(model.id));
      }
      return next;
    });
  }

  return (
    <div className="club-model-selectors">
      {[...selectedMakeIds].map((makeId) => (
        <input key={`make:${makeId}`} type="hidden" name="makeIds" value={makeId} />
      ))}
      {[...selectedModelIds].map((modelId) => (
        <input key={`model:${modelId}`} type="hidden" name="modelIds" value={modelId} />
      ))}

      <MultiSelectDropdown
        label="Make"
        summary={makeSummary}
        isOpen={openMenu === "make"}
        onToggle={() => setOpenMenu((menu) => (menu === "make" ? null : "make"))}
      >
        <label className="club-multi-option is-select-all">
          <input type="checkbox" checked={allMakesSelected} onChange={toggleAllMakes} />
          <span>Select all makes</span>
        </label>
        {sortedMakes.map((make) => (
          <label key={make.id} className="club-multi-option">
            <input type="checkbox" checked={selectedMakeIds.has(make.id)} onChange={() => toggleMake(make.id)} />
            <span>{make.name}</span>
          </label>
        ))}
      </MultiSelectDropdown>

      <MultiSelectDropdown
        label="Model"
        summary={modelSummary}
        isOpen={openMenu === "model"}
        onToggle={() => {
          if (selectedMakeIds.size === 0) return;
          if (openMenu === "model") {
            setOpenMenu(null);
            return;
          }
          setOpenMenu("model");
          void loadModels([...selectedMakeIds]);
        }}
        disabled={selectedMakeIds.size === 0}
      >
        <label className="club-multi-option is-select-all">
          <input type="checkbox" checked={allModelsSelected} onChange={toggleAllModels} />
          <span>Select all models</span>
        </label>
        {modelLoadState === "loading" ? <p className="club-widget-note">Loading selected models...</p> : null}
        {modelLoadState === "error" ? <p className="club-widget-note">Models could not be loaded. Close and try again.</p> : null}
        {availableModels.map((model) => (
          <label key={model.id} className="club-multi-option">
            <input type="checkbox" checked={selectedModelIds.has(model.id)} onChange={() => toggleModel(model.id)} />
            <span>
              {makeNamesById.get(model.makeId)} {model.name}
            </span>
          </label>
        ))}
      </MultiSelectDropdown>
    </div>
  );
}

function MultiSelectDropdown({
  label,
  summary,
  isOpen,
  onToggle,
  disabled = false,
  children,
}: {
  label: string;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openDirection, setOpenDirection] = useState<"down" | "up">("down");

  useEffect(() => {
    if (!isOpen) return;
    const updateDirection = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenDirection(spaceBelow < 300 && spaceAbove > spaceBelow ? "up" : "down");
    };

    updateDirection();
    window.addEventListener("resize", updateDirection);
    window.addEventListener("scroll", updateDirection, true);
    return () => {
      window.removeEventListener("resize", updateDirection);
      window.removeEventListener("scroll", updateDirection, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggle();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onToggle]);

  return (
    <div ref={rootRef} className={`club-multi-select${isOpen ? " is-open" : ""}${openDirection === "up" ? " is-up" : ""}`}>
      <button type="button" aria-expanded={isOpen} disabled={disabled} onClick={onToggle}>
        <span>{label}</span>
        <strong>{summary}</strong>
      </button>
      {isOpen ? (
        <>
          <button type="button" className="club-multi-backdrop" aria-label={`Close ${label} selector`} onClick={onToggle} />
          <div className="club-multi-menu" role="listbox" aria-label={`${label} selector`}>
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
