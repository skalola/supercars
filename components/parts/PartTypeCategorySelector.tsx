"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CategoryLineIcon } from "@/components/parts/PartsStoreExplorer";
import { getPartOffersApiPath, getPartTypeDetailPath, getPartTypesApiPath } from "@/lib/parts/parts-api";

type PartSystem = {
  id: string;
  name: string;
  slug: string;
  componentCount: number;
};

export type PartTaxonomySearchItem = {
  kind: "system" | "part";
  id: string;
  name: string;
  slug: string;
  systemName: string;
  systemSlug: string;
  groupName: string | null;
  groupSlug: string | null;
};

type VehiclePartType = {
  id: string;
  mapped: boolean;
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
  searchIndex?: PartTaxonomySearchItem[];
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
  searchIndex = [],
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
  const [loadingPartTypeSlug, setLoadingPartTypeSlug] = useState("");
  const [loadError, setLoadError] = useState("");
  const [fitmentNotice, setFitmentNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [isNavigating, startNavigation] = useTransition();
  const discoveryRequest = useRef<AbortController | null>(null);

  useEffect(() => () => discoveryRequest.current?.abort(), []);

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
  const activeGroup = componentGroups.find((group) => group.slug === activeGroupSlug)
    ?? (activePartTypeSlug ? initialGroup : null);
  const activePartType = activePartTypes.find((partType) => partType.componentType.slug === activePartTypeSlug)
    ?? initialPartTypes.find((partType) => partType.componentType.slug === activePartTypeSlug)
    ?? null;
  const searchResults = useMemo(() => {
    const normalized = normalizeSearch(searchQuery);
    if (normalized.length < 2) return [];
    const tokens = normalized.split(" ").filter(Boolean);
    return searchIndex
      .map((item) => {
        const haystack = normalizeSearch([item.name, item.groupName, item.systemName].filter(Boolean).join(" "));
        if (!tokens.every((token) => haystack.includes(token))) return null;
        const name = normalizeSearch(item.name);
        const score = name === normalized ? 0 : name.startsWith(normalized) ? 1 : haystack.startsWith(normalized) ? 2 : 3;
        return { item, score };
      })
      .filter((result): result is { item: PartTaxonomySearchItem; score: number } => Boolean(result))
      .sort((left, right) => left.score - right.score || alphabeticalCompare(left.item.name, right.item.name))
      .slice(0, 8)
      .map((result) => result.item);
  }, [searchIndex, searchQuery]);

  async function loadPartTypes(system: PartSystem) {
    const cached = partTypesBySystem[system.slug];
    if (cached) return cached;
    setLoadingSystemSlug(system.slug);
    try {
      const response = await fetch(getPartTypesApiPath({ makeSlug, modelSlug }, system.slug));
      const payload = await response.json() as { partTypes?: VehiclePartType[]; error?: string };
      if (!response.ok || !payload.partTypes) throw new Error(payload.error || "Parts are unavailable for this category.");
      setPartTypesBySystem((current) => ({ ...current, [system.slug]: payload.partTypes ?? [] }));
      return payload.partTypes;
    } finally {
      setLoadingSystemSlug("");
    }
  }

  async function selectSystem(system: PartSystem) {
    discoveryRequest.current?.abort();
    setActiveSystemSlug(system.slug);
    setActiveGroupSlug("");
    setActivePartTypeSlug("");
    setSelectionComplete(false);
    setLoadError("");
    setFitmentNotice("");
    try {
      await loadPartTypes(system);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Parts are unavailable for this category.");
    }
  }

  async function selectSearchResult(result: PartTaxonomySearchItem) {
    const system = systems.find((candidate) => candidate.slug === result.systemSlug);
    if (!system) return;
    discoveryRequest.current?.abort();
    setActiveSystemSlug(system.slug);
    setActiveGroupSlug("");
    setActivePartTypeSlug("");
    setSelectionComplete(false);
    setLoadError("");
    setFitmentNotice("");
    setSearchQuery("");
    setSearchFocused(false);
    if (result.kind === "system") {
      try {
        await loadPartTypes(system);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Parts are unavailable for this category.");
      }
      return;
    }
    try {
      const partTypes = await loadPartTypes(system);
      const partType = partTypes.find((candidate) => candidate.componentType.slug === result.slug);
      if (!partType) throw new Error("That part type is not currently available.");
      setActiveGroupSlug(partType.componentGroup.slug);
      setActivePartTypeSlug(partType.componentType.slug);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Parts are unavailable for this category.");
    }
  }

  function resetBrowser() {
    discoveryRequest.current?.abort();
    setActiveSystemSlug("");
    setActiveGroupSlug("");
    setActivePartTypeSlug("");
    setSelectionComplete(false);
    setLoadError("");
    setFitmentNotice("");
  }

  async function selectPartType(partType: VehiclePartType) {
    if (!activeSystem) return;
    discoveryRequest.current?.abort();
    const controller = new AbortController();
    discoveryRequest.current = controller;
    setActivePartTypeSlug(partType.componentType.slug);
    setSelectionComplete(false);
    setLoadingPartTypeSlug(partType.componentType.slug);
    setLoadError("");
    setFitmentNotice("");
    try {
      const response = await fetch(getPartOffersApiPath(
        { makeSlug, modelSlug },
        { systemSlug: activeSystem.slug, partTypeSlug: partType.componentType.slug, year },
      ), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemSlug: activeSystem.slug, year }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Compatible parts could not be loaded.");
      if (controller.signal.aborted) return;
      setSelectionComplete(true);
      const path = getPartTypeDetailPath(
        { makeSlug, modelSlug },
        { systemSlug: activeSystem.slug, partTypeSlug: partType.componentType.slug, year, vehicleId },
      );
      startNavigation(() => router.push(path, { scroll: false }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFitmentNotice(error instanceof Error ? error.message : "Compatible parts could not be loaded.");
    } finally {
      if (discoveryRequest.current === controller) {
        discoveryRequest.current = null;
        setLoadingPartTypeSlug("");
      }
    }
  }

  return (
    <section className="part-type-browser" aria-label="Browse compatible parts" aria-busy={loading || Boolean(loadingSystemSlug) || Boolean(loadingPartTypeSlug) || isNavigating}>
      <header className="part-type-browser-heading">
        <div><span>Compatible Catalog</span><h2>Choose a Category</h2></div>
        <div className="part-type-browser-search">
          <label htmlFor="parts-taxonomy-search">Search categories and parts</label>
          <div>
            <span aria-hidden="true">⌕</span>
            <input
              id="parts-taxonomy-search"
              type="search"
              value={searchQuery}
              placeholder="Search oil, brakes, intake..."
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchFocused && searchQuery.trim().length >= 2}
              aria-controls="parts-taxonomy-search-results"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          {searchFocused && searchQuery.trim().length >= 2 ? (
            <div id="parts-taxonomy-search-results" className="part-type-browser-search-results" role="listbox">
              {searchResults.length > 0 ? searchResults.map((result) => (
                <button key={`${result.kind}:${result.id}`} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => void selectSearchResult(result)}>
                  <strong>{result.name}</strong>
                  <small>{result.kind === "system" ? "Category" : [result.systemName, result.groupName].filter(Boolean).join(" / ")}</small>
                </button>
              )) : <p>No matching categories or parts.</p>}
            </div>
          ) : null}
        </div>
      </header>

      <nav className="part-type-browser-breadcrumbs" aria-label="Parts catalog breadcrumb">
        <button type="button" onClick={resetBrowser}>Parts</button>
        {activeSystem ? <><span aria-hidden="true">/</span><button type="button" onClick={() => void selectSystem(activeSystem)}>{activeSystem.name}</button></> : null}
        {activeGroup ? <><span aria-hidden="true">/</span><button type="button" onClick={() => { setActiveGroupSlug(activeGroup.slug); setActivePartTypeSlug(""); setSelectionComplete(false); }}>{activeGroup.name}</button></> : null}
        {activePartType ? <><span aria-hidden="true">/</span><strong>{activePartType.componentType.name}</strong></> : null}
      </nav>

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
      {fitmentNotice ? <p className="part-type-browser-notice" role="status">{fitmentNotice}</p> : null}
      {loading && systems.length === 0 ? <div className="part-type-browser-status">Loading compatible categories...</div> : null}
      {loadingSystemSlug && loadingSystemSlug === activeSystemSlug ? <div className="part-type-browser-status">Loading compatible components...</div> : null}

      {!loading && systems.length === 0 ? (
        <div className="part-type-browser-empty part-type-browser-empty-wide">
          <div>
            <strong>Parts taxonomy unavailable</strong>
            <p>No active category definitions are currently available.</p>
          </div>
        </div>
      ) : null}

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
                onClick={() => void selectPartType(partType)}
                disabled={Boolean(loadingPartTypeSlug) || isNavigating}
              >
                <CategoryLineIcon slug={activeSystem.slug} />
                <span>
                  <strong>{partType.componentType.name}</strong>
                  <small>{partType.componentType.description
                    ? partType.componentType.description
                    : "Review fitment, performance, and available offers"}</small>
                </span>
                <i aria-hidden="true">{(isNavigating || loadingPartTypeSlug === partType.componentType.slug) && activePartTypeSlug === partType.componentType.slug ? "..." : "›"}</i>
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

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}
