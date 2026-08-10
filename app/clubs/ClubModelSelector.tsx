"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { MakeOption, ModelOption } from "@/lib/makes/catalog";

export default function ClubModelSelector({
  makes,
  models,
  initialModelIds = [],
}: {
  makes: MakeOption[];
  models: ModelOption[];
  initialModelIds?: string[];
}) {
  const [openMenu, setOpenMenu] = useState<"make" | "model" | null>(null);
  const [selectedMakeIds, setSelectedMakeIds] = useState<Set<string>>(() => new Set());
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set(initialModelIds));

  const sortedMakes = [...makes].sort((a, b) => a.name.localeCompare(b.name));
  const availableModels = selectedMakeIds.size > 0
    ? models
        .filter((model) => selectedMakeIds.has(model.makeId))
        .sort((a, b) => a.make.name.localeCompare(b.make.name) || a.name.localeCompare(b.name))
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
    : allModelsSelected
    ? "All models selected"
    : selectedVisibleModelCount > 0
      ? `${selectedVisibleModelCount} ${selectedVisibleModelCount === 1 ? "model" : "models"} selected`
      : "All or selected models";

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
          if (selectedMakeIds.size > 0) setOpenMenu((menu) => (menu === "model" ? null : "model"));
        }}
        disabled={selectedMakeIds.size === 0}
      >
        <label className="club-multi-option is-select-all">
          <input type="checkbox" checked={allModelsSelected} onChange={toggleAllModels} />
          <span>Select all models</span>
        </label>
        {availableModels.map((model) => (
          <label key={model.id} className="club-multi-option">
            <input type="checkbox" checked={selectedModelIds.has(model.id)} onChange={() => toggleModel(model.id)} />
            <span>
              {model.make.name} {model.name}
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
  return (
    <div className={`club-multi-select${isOpen ? " is-open" : ""}`}>
      <button type="button" aria-expanded={isOpen} disabled={disabled} onClick={onToggle}>
        <span>{label}</span>
        <strong>{summary}</strong>
      </button>
      {isOpen ? <div className="club-multi-menu">{children}</div> : null}
    </div>
  );
}
