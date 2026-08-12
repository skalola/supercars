export const MEET_TYPE_OPTIONS = ["Cars & Coffee", "Cruise", "Track Day"] as const;

export type MeetTypeOption = (typeof MEET_TYPE_OPTIONS)[number];

export function normalizeMeetType(value: string | null | undefined): MeetTypeOption {
  const normalized = (value || "").trim().toLowerCase();

  if (normalized.includes("track")) return "Track Day";
  if (normalized.includes("cruise") || normalized.includes("drive")) return "Cruise";
  return "Cars & Coffee";
}

export function getMeetTypeBadgeClass(value: string | null | undefined) {
  const type = normalizeMeetType(value);
  if (type === "Track Day") return "is-track-day";
  if (type === "Cruise") return "is-cruise";
  return "is-cars-coffee";
}
