import { type EventData } from "./types.js";
export interface NormalizedError {
    errorType: string;
    message: string;
    stack: string | null;
}
export declare const truncate: (value: string, max: number) => string;
/** Turns anything that was thrown (Error, string, plain object, …) into a capped, storable shape. */
export declare const normalizeError: (err: unknown) => NormalizedError;
/**
 * Keeps only flat primitive values, caps key count and total size. Returns
 * undefined when nothing usable is left. Used for server calls; client
 * reports are validated strictly instead (see validate.ts).
 */
export declare const sanitizeData: (data: unknown) => EventData | undefined;
