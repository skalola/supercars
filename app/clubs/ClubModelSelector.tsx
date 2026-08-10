"use client";

import { useMemo, useState } from "react";
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

  const selectedMakeLabels = useMemo(
    () => makes.filter((make) => selectedMakeIds.has(make.id)).map((make) => make.name),
    [makes, selectedMakeIds],
  );
  const selectedModelLabels = useMemo(
    () => models.filter((model) => selectedModelIds.has(model.id)).map((model) => `${model.make.name} ${model.name}`),
    [models, selectedModelIds],
  );
  const allMakesSelected = makes.length > 0 && selectedMakeIds.size === makes.length;
  const allModelsSelected = models.length > 0 && selectedModelIds.size === models.length;
  const makeSummary = allMakesSelected
    ? "All makes selected"
    : selectedMakeLabels.length > 0
      ? selectedMakeLabels.join(", ")
      : "All or selected makes";
  const modelSummary = allModelsSelected
    ? "All models selected"
    : selectedModelLabels.length > 0
      ? selectedModelLabels.join(", ")
      : "All or selected models";

  function toggleMake(makeId: string) {
    setSelectedMakeIds((current) => {
      const next = new Set(current);
      if (next.has(makeId)) {
        next.delete(makeId);
      } else {
        next.add(makeId);
      }
      return next;
    });
  }

  function toggleAllMakes() {
    setSelectedMakeIds((current) => (current.size === makes.length ? new Set() : new Set(makes.map((make) => make.id))));
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
    setSelectedModelIds((current) => (current.size === models.length ? new Set() : new Set(models.map((model) => model.id))));
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
        {makes.map((make) => (
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
        onToggle={() => setOpenMenu((menu) => (menu === "model" ? null : "model"))}
      >
        <label className="club-multi-option is-select-all">
          <input type="checkbox" checked={allModelsSelected} onChange={toggleAllModels} />
          <span>Select all models</span>
        </label>
        {models.map((model) => (
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
  children,
}: {
  label: string;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`club-multi-select${isOpen ? " is-open" : ""}`}>
      <button type="button" aria-expanded={isOpen} onClick={onToggle}>
        <span>{label}</span>
        <strong>{summary}</strong>
      </button>
      {isOpen ? <div className="club-multi-menu">{children}</div> : null}
    </div>
  );
}
