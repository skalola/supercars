export const SUPPORTED_MAKES = ["Ferrari", "Lamborghini", "McLaren"] as const;

export type SupportedMake = (typeof SUPPORTED_MAKES)[number];

export const SUPPORTED_MAKE_SLUGS = SUPPORTED_MAKES.map((make) => make.toLowerCase());

export function normalizeSupportedMake(value: string | null | undefined): SupportedMake | null {
  if (!value) return null;
  const text = value.toLowerCase();
  if (text.includes("ferrari")) return "Ferrari";
  if (text.includes("lamborghini")) return "Lamborghini";
  if (text.includes("mclaren") || text.includes("mcclaren")) return "McLaren";
  return null;
}

export function isSupportedMake(value: string | null | undefined): value is SupportedMake {
  return Boolean(normalizeSupportedMake(value));
}

export function supportedMakePattern(flags = "i") {
  return new RegExp("ferrari|lamborghini|mclaren|mcclaren", flags);
}

export function makeFromVinPrefix(vin: string | null | undefined): SupportedMake | null {
  const upperVin = vin?.toUpperCase() ?? "";
  if (upperVin.startsWith("ZFF") || upperVin.startsWith("ZFA")) return "Ferrari";
  if (upperVin.startsWith("ZHW")) return "Lamborghini";
  if (upperVin.startsWith("SBM")) return "McLaren";
  return null;
}
