const catalogLabelCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function compareCatalogLabels(
  first: { name: string },
  second: { name: string },
) {
  return compareCatalogNames(first.name, second.name);
}

export function compareCatalogNames(first: string, second: string) {
  return catalogLabelCollator.compare(first.trim(), second.trim());
}

export function sortCatalogLabels<T extends { name: string }>(items: T[]) {
  return [...items].sort(compareCatalogLabels);
}
