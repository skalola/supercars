"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MakeOption = {
  id: string;
  name: string;
};

export function AllowedMakesDropdown({
  makes,
  defaultSelectedNames,
}: {
  makes: MakeOption[];
  defaultSelectedNames?: string[];
}) {
  const orderedMakes = useMemo(
    () => [...makes].sort((left, right) => left.name.localeCompare(right.name)),
    [makes],
  );
  const defaultSelection = useMemo(() => {
    const available = new Set(orderedMakes.map((make) => make.name));
    return new Set((defaultSelectedNames || []).filter((name) => available.has(name)));
  }, [defaultSelectedNames, orderedMakes]);
  const defaultsToAll = defaultSelectedNames !== undefined
    && orderedMakes.length > 0
    && defaultSelection.size === orderedMakes.length;
  const [allMakes, setAllMakes] = useState(defaultsToAll);
  const [selected, setSelected] = useState<Set<string>>(
    defaultsToAll ? new Set(orderedMakes.map((make) => make.name)) : defaultSelection,
  );
  const [query, setQuery] = useState("");
  const [selectionError, setSelectionError] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
        detailsRef.current.open = false;
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current) {
        detailsRef.current.open = false;
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const visibleMakes = orderedMakes.filter((make) =>
    make.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const summary = allMakes
    ? "All makes"
    : selected.size === 0
      ? "Select makes"
      : selected.size === 1
        ? [...selected][0]
        : `${selected.size} makes selected`;

  function toggleMake(name: string) {
    setSelectionError(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAllMakes(enabled: boolean) {
    setSelectionError(false);
    setAllMakes(enabled);
    setSelected(enabled ? new Set(orderedMakes.map((make) => make.name)) : new Set());
  }

  return (
    <div className="meet-make-select">
      <span className="meet-make-select-label">Allowed Makes</span>
      <details ref={detailsRef} className="meet-make-dropdown">
        <summary>
          <span>{summary}</span>
          <small>{allMakes ? "No make restrictions" : "Choose one or more"}</small>
        </summary>
        <div className="meet-make-dropdown-menu">
          <label className="meet-make-all-option">
            <input
              name="allMakes"
              type="checkbox"
              value="true"
              checked={allMakes}
              onChange={(event) => toggleAllMakes(event.target.checked)}
            />
            <span>
              <strong>All makes</strong>
              <small>Open to every vehicle brand</small>
            </span>
          </label>

          <div className="meet-make-search">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search makes"
              aria-label="Search allowed makes"
            />
          </div>

          <div className="meet-make-options" aria-label="Allowed vehicle makes">
            {visibleMakes.map((make) => (
              <label key={make.id} className="meet-make-option">
                <input
                  name="allowedMakes"
                  type="checkbox"
                  value={make.name}
                  checked={selected.has(make.name)}
                  disabled={allMakes}
                  onChange={() => toggleMake(make.name)}
                />
                <span>{make.name}</span>
              </label>
            ))}
            {visibleMakes.length === 0 ? <p>No makes match your search.</p> : null}
          </div>
        </div>
      </details>
      <input
        type="checkbox"
        required
        checked={allMakes || selected.size > 0}
        onChange={() => undefined}
        onInvalid={() => setSelectionError(true)}
        tabIndex={-1}
        aria-label="Choose at least one allowed make"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      {selectionError ? (
        <small role="alert" style={{ color: "#ef4444" }}>
          Choose at least one make or select All makes.
        </small>
      ) : null}
    </div>
  );
}
