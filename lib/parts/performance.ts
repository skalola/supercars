type InstalledPartLike = {
  hpGainOverride?: number | null;
  torqueGainOverride?: number | null;
  part?: {
    estimatedHpGain?: number | null;
    estimatedTorqueGain?: number | null;
  } | null;
};

export function parsePerformanceNumber(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;

  const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function summarizeInstalledPartGains(installedParts: InstalledPartLike[]) {
  return installedParts.reduce(
    (summary, installedPart) => {
      const hpGain = installedPart.hpGainOverride ?? installedPart.part?.estimatedHpGain ?? 0;
      const torqueGain = installedPart.torqueGainOverride ?? installedPart.part?.estimatedTorqueGain ?? 0;

      return {
        hpGain: summary.hpGain + hpGain,
        torqueGain: summary.torqueGain + torqueGain,
      };
    },
    { hpGain: 0, torqueGain: 0 }
  );
}

export function calculateModifiedPerformance(params: {
  stockHorsepower?: string | number | null;
  stockTorque?: string | number | null;
  installedParts: InstalledPartLike[];
}) {
  const stockHorsepower = parsePerformanceNumber(params.stockHorsepower);
  const stockTorque = parsePerformanceNumber(params.stockTorque);
  const gains = summarizeInstalledPartGains(params.installedParts);

  return {
    stockHorsepower,
    stockTorque,
    hpGain: gains.hpGain,
    torqueGain: gains.torqueGain,
    modifiedHorsepower: stockHorsepower === null ? null : stockHorsepower + gains.hpGain,
    modifiedTorque: stockTorque === null ? null : stockTorque + gains.torqueGain,
  };
}
