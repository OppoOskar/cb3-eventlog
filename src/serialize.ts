import { LIMITS, type EventData } from "./types.js";

export interface NormalizedError {
  errorType: string;
  message: string;
  stack: string | null;
}

export const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const stringify = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/** Turns anything that was thrown (Error, string, plain object, …) into a capped, storable shape. */
export const normalizeError = (err: unknown): NormalizedError => {
  if (err instanceof Error) {
    return {
      errorType: truncate(err.name || "Error", LIMITS.errorType),
      message: truncate(err.message || "(no message)", LIMITS.message),
      stack: err.stack ? truncate(err.stack, LIMITS.stack) : null,
    };
  }
  return {
    errorType: "NonError",
    message: truncate(typeof err === "string" ? err : stringify(err), LIMITS.message),
    stack: null,
  };
};

/**
 * Keeps only flat primitive values, caps key count and total size. Returns
 * undefined when nothing usable is left. Used for server calls; client
 * reports are validated strictly instead (see validate.ts).
 */
export const sanitizeData = (data: unknown): EventData | undefined => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const out: EventData = {};
  for (const [key, value] of Object.entries(data).slice(0, LIMITS.dataKeys)) {
    if (value === null || typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = truncate(value, 200);
  }
  if (Object.keys(out).length === 0) return undefined;
  return JSON.stringify(out).length <= LIMITS.dataBytes ? out : undefined;
};
