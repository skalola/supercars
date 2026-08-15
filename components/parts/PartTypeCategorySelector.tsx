"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CategoryLineIcon } from "@/components/parts/PartsStoreExplorer";
import { getPartTypeDetailPath, getPartTypesApiPath } from "@/lib/parts/parts-api";

type PartSystem = {
  id: string;
  name: string;
  slug: string;
  componentCount: number;
};

type VehiclePartType = {
  id: string;
  componentGroup: { name: string; slug: string };
  componentType: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  };
  _count: { offerContexts: number };
};

type PartTypeCategorySelectorProps = {
  systems: PartSystem[];
  initialPartTypes?: VehiclePartType[];
  initialSystemSlug?: string;
  initialPartTypeSlug?: string;
  makeSlug: string;
  modelSlug: string;
  year: number | null;
  vehicleId: string | null;
  loading?: boolean;
};

export function PartTypeCategorySelector({
  systems,
  initialPartTypes = [],
  initialSystemSlug = "",
  initialPartTypeSlug = "",
  makeSlug,
  modelSlug,
  year,
  vehicleId,
  loading = false,
}: PartTypeCategorySelectorProps) {
  const router = useRouter();
  const initialGroup = initialPartTypes.find((partType) => partType.componentType.slug === initialPartTypeSlug)?.componentGroup ?? null;
  const [partTypesBySystem, setPartTypesBySystem] = useState<Record<string, VehiclePartType[]>>(
    initialSystemSlug ? { [initialSystemSlug]: initialPartTypes } : {},
  );
  const [activeSystemSlug, setActiveSystemSlug] = useState(initialSystemSlug);
  const [activeGroupSlug, setActiveGroupSlug] = useState(initialGroup?.slug ?? "");
  const [activePartTypeSlug, setActivePartTypeSlug] = useState(initialPartTypeSlug);
  const [selectionComplete, setSelectionComplete] = useState(Boolean(initialPartTypeSlug));
  const [loadingSystemSlug, setLoadingSystemSlug] = useState("");
  const [loadError, setLoadError] = useState("");
  const [isNavigating, startNavigation] = useTransition();

  const activeSystem = systems.find((system) => system.slug === activeSystemSlug) ?? null;
  const orderedSystems = useMemo(
    () => [...systems].sort((left, right) => alphabeticalCompare(shortSystemName(left.name), shortSystemName(right.name))),
    [systems],
  );
  const activePartTypes = useMemo(
    () => partTypesBySystem[activeSystemSlug] ?? [],
    [activeSystemSlug, partTypesBySystem],
  );
  const componentGroups = useMemo(() => {
    const groups = new Map<string, { name: string; slug: string; count: number }>();
    for (const partType of activePartTypes) {
      const current = groups.get(partType.componentGroup.slug);
      groups.set(partType.componentGroup.slug, {
        ...partType.componentGroup,
        count: (current?.count ?? 0) + 1,
      });
    }
    return [...groups.values()].sort((left, right) => alphabeticalCompare(left.name, right.name));
  }, [activePartTypes]);
  const visiblePartTypes = activeGroupSlug
    ? activePartTypes
      .filter((partType) => partType.componentGroup.slug === activeGroupSlug)
      .sort((left, right) => alphabeticalCompare(left.componentType.name, right.componentType.name))
    : [];

  async function selectSystem(system: PartSystem) {
    setActiveSystemSlug(system.slug);
    setActiveGroupSlug("");
    setActivePartTypeSlug("");
    setSelectionComplete(false);
    setLoadError("");
    if (partTypesBySystem[system.slug]) return;

    setLoadingSystemSlug(system.slug);
    try {
      const response = await fetch(getPartTypesApiPath({ makeSlug, modelSlug }, system.slug));
      const payload = await response.json() as { partTypes?: VehiclePartType[]; error?: string };
      if (!response.ok || !payload.partTypes) throw new Error(payload.error || "Parts are unavailable for this category.");
      setPartTypesBySystem((current) => ({ ...current, [system.slug]: payload.partTypes ?? [] }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Parts are unavailable for this category.");
    } finally {
      setLoadingSystemSlug("");
    }
  }

  function selectPartType(partType: VehiclePartType) {
    if (!activeSystem) return;
    setActivePartTypeSlug(partType.componentType.slug);
    setSelectionComplete(true);
    const path = getPartTypeDetailPath(
      { makeSlug, modelSlug },
      { systemSlug: activeSystem.slug, partTypeSlug: partType.componentType.slug, year, vehicleId },
    );
    startNavigation(() => router.push(path, { scroll: false }));
  }

  return (
    <section className="part-type-browser" aria-label="Browse compatible parts" aria-busy={loading || Boolean(loadingSystemSlug) || isNavigating}>
      <header className="part-type-browser-heading">
        <div><span>Compatible Catalog</span><h2>Choose a Category</h2></div>
        <p>Move from system to component to a vehicle-specific part without leaving this workspace.</p>
      </header>

      <div className="part-type-browser-systems" role="list" aria-label="Part categories">
        {orderedSystems.map((system) => (
          <button
            key={system.id}
            type="button"
            className={activeSystemSlug === system.slug ? "is-active" : ""}
            data-category={system.slug}
            aria-pressed={activeSystemSlug === system.slug}
            onClick={() => void selectSystem(system)}
          >
            <CategoryLineIcon slug={system.slug} />
            <span><strong>{shortSystemName(system.name)}</strong><small>{system.componentCount.toLocaleString()} types</small></span>
          </button>
        ))}
      </div>

      {loadError ? <p className="part-type-browser-error" role="alert">{loadError}</p> : null}
      {loading && systems.length === 0 ? <div className="part-type-browser-status">Loading compatible categories...</div> : null}
      {loadingSystemSlug && loadingSystemSlug === activeSystemSlug ? <div className="part-type-browser-status">Loading compatible components...</div> : null}

      {activeSystem && !loadingSystemSlug && !selectionComplete ? (
        <div className="part-type-browser-carousel-stage" aria-live="polite">
          <div className="part-type-browser-level-heading">
            <div>
              <span>{activeGroupSlug ? "Parts" : "Components"}</span>
              <strong>{activeGroupSlug
                ? componentGroups.find((group) => group.slug === activeGroupSlug)?.name
                : activeSystem.name}</strong>
            </div>
            {activeGroupSlug ? (
              <button type="button" className="part-type-browser-back" onClick={() => setActiveGroupSlug("")}>
                <span aria-hidden="true">‹</span> Back to components
              </button>
            ) : <small>Select a component to reveal its part types</small>}
          </div>

          <div className={`part-type-browser-option-carousel${activeGroupSlug ? " is-parts" : " is-components"}`}>
            {activeGroupSlug ? visiblePartTypes.map((partType) => (
              <button
                key={partType.id}
                type="button"
                className={activePartTypeSlug === partType.componentType.slug ? "is-active" : ""}
                aria-current={activePartTypeSlug === partType.componentType.slug ? "page" : undefined}
                onClick={() => selectPartType(partType)}
              >
                <CategoryLineIcon slug={activeSystem.slug} />
                <span>
                  <strong>{partType.componentType.name}</strong>
                  <small>{partType.componentType.description || "View fitment, performance, and available offers"}</small>
                </span>
                <i aria-hidden="true">{isNavigating && activePartTypeSlug === partType.componentType.slug ? "..." : "›"}</i>
              </button>
            )) : componentGroups.map((group) => (
              <button
                key={group.slug}
                type="button"
                onClick={() => setActiveGroupSlug(group.slug)}
              >
                <CategoryLineIcon slug={activeSystem.slug} />
                <span><strong>{group.name}</strong><small>{group.count.toLocaleString()} part {group.count === 1 ? "type" : "types"}</small></span>
                <i aria-hidden="true">›</i>
              </button>
            ))}
          </div>
        </div>
      ) : !loading && systems.length > 0 && !selectionComplete ? (
        <div className="part-type-browser-empty part-type-browser-empty-wide"><span>01</span><p>Select a category to reveal compatible component groups.</p></div>
      ) : null}
    </section>
  );
}

function shortSystemName(name: string) {
  return name
    .replace("Maintenance & Service", "Maintenance")
    .replace("Exhaust & Emissions", "Exhaust")
    .replace("ECU & Electronics", "ECU")
    .replace("Transmission & Drivetrain", "Drivetrain")
    .replace("Suspension & Steering", "Suspension")
    .replace("Body & Exterior", "Body")
    .replace("Accessories & Care", "Accessories")
    .replace("Performance Packages", "Performance");
}

function alphabeticalCompare(left: string, right: string) {
  return left.localeCompare(right, "en", { sensitivity: "base", numeric: true });
}
