export type MaintenanceRuleInput = {
  id: string;
  serviceName: string;
  description: string | null;
  intervalMiles: number | null;
  intervalMonths: number | null;
  priority: string;
};

export type ServiceRecordInput = {
  mileage: number | null;
  serviceDate?: Date | string;
  description: string | null;
};

export type MaintenanceRecommendation = {
  ruleId: string;
  serviceName: string;
  description: string | null;
  priority: string;
  status: "DUE" | "DUE_SOON" | "UPCOMING";
  dueText: string;
  remainingMiles: number | null;
  alertKey: string;
};

const priorityOrder: Record<string, number> = {
  REQUIRED: 1,
  RECOMMENDED: 2,
  INSPECT: 3,
};

export function sortMaintenanceRules<T extends MaintenanceRuleInput>(rules: T[]): T[] {
  return [...rules].sort((a, b) => {
    const pA = priorityOrder[a.priority] || 99;
    const pB = priorityOrder[b.priority] || 99;
    if (pA !== pB) return pA - pB;
    return (a.intervalMiles || 0) - (b.intervalMiles || 0);
  });
}

export function getNextMaintenanceRecommendation({
  currentMileage,
  rules,
  serviceRecords,
}: {
  currentMileage: number | null;
  rules: MaintenanceRuleInput[];
  serviceRecords: ServiceRecordInput[];
}): MaintenanceRecommendation | null {
  if (currentMileage === null || rules.length === 0) return null;

  for (const rule of sortMaintenanceRules(rules)) {
    const records = serviceRecords.filter((record) =>
      record.description?.startsWith(`[${rule.serviceName}]`)
    );
    const lastCompletedMileage = records.reduce((max, record) => Math.max(max, record.mileage || 0), 0);

    if (rule.intervalMiles) {
      let nextMilestone = Math.ceil(currentMileage / rule.intervalMiles) * rule.intervalMiles;
      while (nextMilestone <= lastCompletedMileage) {
        nextMilestone += rule.intervalMiles;
      }

      const remainingMiles = nextMilestone - currentMileage;
      const status =
        remainingMiles <= 0 ? "DUE" : remainingMiles <= 1000 ? "DUE_SOON" : "UPCOMING";

      return {
        ruleId: rule.id,
        serviceName: rule.serviceName,
        description: rule.description,
        priority: rule.priority,
        status,
        dueText: `${nextMilestone.toLocaleString()} miles`,
        remainingMiles,
        alertKey: `${rule.id}:${nextMilestone}`,
      };
    }

    if (rule.intervalMonths) {
      const dueText =
        rule.intervalMonths === 12 ? "Annually" : `Every ${rule.intervalMonths} months`;

      return {
        ruleId: rule.id,
        serviceName: rule.serviceName,
        description: rule.description,
        priority: rule.priority,
        status: "UPCOMING",
        dueText,
        remainingMiles: null,
        alertKey: `${rule.id}:months:${rule.intervalMonths}`,
      };
    }
  }

  return null;
}
