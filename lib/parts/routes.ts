export function getPartDetailPath(part: { slug: string; brand: { slug: string } }) {
  return `/parts/${part.brand.slug}/${part.slug}`;
}
