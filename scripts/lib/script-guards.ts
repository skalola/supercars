type BatchLimitOptions = {
  defaultLimit: number;
  maxLimit: number;
  argName?: string;
};

export function getArgValue(name: string) {
  const prefix = `${name}=`;
  const inlineValue = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (inlineValue !== undefined) return inlineValue;

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function hasArg(name: string) {
  return process.argv.includes(name);
}

export function isExecuteMode() {
  return hasArg("--execute");
}

export function getBatchLimit({ defaultLimit, maxLimit, argName = "--limit" }: BatchLimitOptions) {
  const parsed = Number(getArgValue(argName) ?? defaultLimit);
  const requested = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : defaultLimit;
  const limit = Math.min(requested, maxLimit);

  if (requested > maxLimit) {
    console.warn(`${argName} capped at ${maxLimit.toLocaleString()} to control database/network usage.`);
  }

  return limit;
}

export function getBatchOffset(argName = "--offset") {
  const parsed = Number(getArgValue(argName) ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function getRotatingBatchOffset(total: number, limit: number, requestedOffset = 0) {
  if (total <= 0 || limit >= total) return 0;
  if (requestedOffset > 0) return Math.min(requestedOffset, total - 1);

  const weeksSinceEpoch = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const batchCount = Math.ceil(total / limit);
  return (weeksSinceEpoch % batchCount) * limit;
}

export function logScriptMode(scriptName: string, execute: boolean, limit: number) {
  console.log(`${scriptName}: ${execute ? "EXECUTE" : "DRY RUN"} mode, limit ${limit.toLocaleString()}.`);
  if (!execute) console.log("Pass --execute to apply database mutations.");
}
