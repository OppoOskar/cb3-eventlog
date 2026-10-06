import type { Level } from "./types.js";
/**
 * Variable parts of a message (ids, numbers, quoted values) are replaced so
 * "Profile 64f… not found" and "Profile 650… not found" land in one group.
 */
export declare const normalizeMessage: (message: string) => string;
/** First stack frame from our own code (falls back to the first frame of any kind). */
export declare const topFrame: (stack: string | null | undefined) => string | null;
/**
 * Strips what changes between builds and hosts without the error changing:
 * origin, query string, line:column and Vite's 8-char content hashes
 * ("nodes/3.Bqx7z1Ab.js" → "nodes/3.js", "chunks/foo-DkJ3a1Xy.js" → "chunks/foo.js").
 */
export declare const normalizeFrame: (frame: string) => string;
/**
 * Identifies an event *kind*, independent of who hit it — the group id.
 * - With an explicit code: level + service + code.
 * - Errors without one: service + error type + normalized message + top in-app frame.
 */
export declare const fingerprint: (input: {
    level: Level;
    service: string;
    code?: string;
    errorType?: string | null;
    message: string;
    stack?: string | null;
}) => string;
