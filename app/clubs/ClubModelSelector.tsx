"use client";

import { useMemo, useState } from "react";
import type { MakeOption, ModelOption } from "@/lib/makes/catalog";

export default function ClubModelSelector({ makes, models }: { makes: MakeOption[]; models: ModelOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMakeIds, setSelectedMakeIds] = useState<Set<string>>(() => new Set());
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set());

  const groups = useMemo(
    () =>
      makes
        .map((make) => ({
          make,
          models: models.filter((model) => model.makeId === make.id),
        }))
        .filter((group) => group.models.length > 0),
    [makes, models],
  );

  const selectedCount = selectedMakeIds.size + selectedModelIds.size;

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
    <div className={`club-model-dropdown${isOpen ? " is-open" : ""}`}>
      {[...selectedMakeIds].map((makeId) => (
        <input key={`make:${makeId}`} type="hidden" name="makeIds" value={makeId} />
      ))}
      {[...selectedModelIds].map((modelId) => (
        <input key={`model:${modelId}`} type="hidden" name="modelIds" value={modelId} />
      ))}

      <button type="button" className="club-model-dropdown-button" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <span>Linked Models</span>
        <strong>{selectedCount > 0 ? `${selectedCount} selected` : "Select makes or models"}</strong>
      </button>

      {isOpen ? (
        <div className="club-model-dropdown-panel">
          {groups.map((group) => {
            const makeSelected = selectedMakeIds.has(group.make.id);
            return (
              <details key={group.make.id} className="club-model-group" open={makeSelected}>
                <summary>
                  <label onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" checked={makeSelected} onChange={() => toggleMake(group.make.id)} />
                    <span>{group.make.name}</span>
                  </label>
                  <em>{makeSelected ? "All models" : `${group.models.length} models`}</em>
                </summary>
                <div>
                  {group.models.map((model) => (
                    <label key={model.id} className={makeSelected ? "is-covered" : ""}>
                      <input
                        type="checkbox"
                        checked={makeSelected || selectedModelIds.has(model.id)}
                        disabled={makeSelected}
                        onChange={() => toggleModel(model.id)}
                      />
                      <span>{model.name}</span>
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
