const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;

export function cleanVin(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return isValidVin(normalized) ? normalized : null;
}

export function isValidVin(value: string | null | undefined): value is string {
  if (!value) return false;
  const cleaned = value.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)) return false;

  // Enforce supported supercar WMI prefixes: Ferrari (ZFF, ZFA), Lamborghini (ZHW), McLaren (SBM).
  const isExoticWmi =
    cleaned.startsWith("ZFF") ||
    cleaned.startsWith("ZFA") ||
    cleaned.startsWith("ZHW") ||
    cleaned.startsWith("SBM");
  if (!isExoticWmi) return false;

  // Safeguard against common layout element words that match length/charset by coincidence
  if (cleaned.includes("PAGE") || cleaned.includes("THEME")) return false;

  return true;
}

export function extractVINFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = text.match(VIN_PATTERN) ?? [];
  for (const match of matches) {
    const vin = cleanVin(match);
    if (vin) return vin;
  }
  return null;
}

export function extractVINsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(VIN_PATTERN) ?? [];
  return Array.from(new Set(matches.map(cleanVin).filter(Boolean) as string[]));
}
