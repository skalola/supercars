import type { MaintenanceSourceRecord } from "./types";

const TRUSTED_PROTOCOL = "https:";

export function validateMaintenanceSource(record: MaintenanceSourceRecord, trustedHosts: ReadonlySet<string>) {
  const reasons: string[] = [];
  let source: URL | null = null;
  try {
    source = new URL(record.sourceUrl);
  } catch {
    reasons.push("Source URL is invalid.");
  }
  if (source?.protocol !== TRUSTED_PROTOCOL) reasons.push("Source must use HTTPS.");
  if (source && !trustedHosts.has(source.hostname.replace(/^www\./, ""))) reasons.push("Source host is not approved for this make.");
  if (!record.intervalMiles && !record.intervalMonths) reasons.push("A fixed maintenance rule requires a mileage or time interval.");
  if (record.intervalMiles !== null && record.intervalMiles !== undefined && record.intervalMiles < 500) reasons.push("Mileage interval is implausibly short.");
  if (record.intervalMonths !== null && record.intervalMonths !== undefined && record.intervalMonths < 1) reasons.push("Time interval is implausibly short.");
  if (record.yearStart && record.yearEnd && record.yearStart > record.yearEnd) reasons.push("Year range is reversed.");
  return { accepted: reasons.length === 0, reasons };
}
