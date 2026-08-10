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
        summary={selectedMakeLabels.length > 0 ? selectedMakeLabels.join(", ") : "All or selected makes"}
        isOpen={openMenu === "make"}
        onToggle={() => setOpenMenu((menu) => (menu === "make" ? null : "make"))}
      >
        {makes.map((make) => (
          <label key={make.id} className="club-multi-option">
            <input type="checkbox" checked={selectedMakeIds.has(make.id)} onChange={() => toggleMake(make.id)} />
            <span>{make.name}</span>
          </label>
        ))}
      </MultiSelectDropdown>

      <MultiSelectDropdown
        label="Model"
        summary={selectedModelLabels.length > 0 ? selectedModelLabels.join(", ") : "All or selected models"}
        isOpen={openMenu === "model"}
        onToggle={() => setOpenMenu((menu) => (menu === "model" ? null : "model"))}
      >
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
