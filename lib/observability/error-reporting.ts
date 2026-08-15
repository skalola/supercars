type ErrorContext = Record<string, string | number | boolean | null | undefined>;

export function reportServerError(error: unknown, context: ErrorContext = {}) {
  const normalized = normalizeError(error);
  console.error(JSON.stringify({
    level: "error",
    timestamp: new Date().toISOString(),
    service: "supercar-dash",
    ...context,
    error: normalized,
  }));
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 1_000),
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    };
  }
  return { name: "UnknownError", message: String(error).slice(0, 1_000) };
}
