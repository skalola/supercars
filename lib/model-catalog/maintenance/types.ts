export type MaintenanceSourceRecord = {
  sourceKey: string;
  sourceType: "OEM" | "GOVERNMENT" | "MANUAL_IMPORT";
  sourceName: string;
  sourceUrl: string;
  makeName: string;
  modelName?: string | null;
  variantName?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  powertrainType?: "ICE" | "DIESEL" | "HYBRID" | "PHEV" | "EV" | "UNKNOWN" | null;
  category: string;
  serviceName: string;
  description?: string | null;
  intervalMiles?: number | null;
  intervalMonths?: number | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: "MEDIUM" | "HIGH" | "SOURCE_VERIFIED";
};
