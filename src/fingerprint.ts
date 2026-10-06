import { createHash } from "node:crypto";
import type { Level } from "./types.js";

/**
 * Variable parts of a message (ids, numbers, quoted values) are replaced so
 * "Profile 64f… not found" and "Profile 650… not found" land in one group.
 */
export const normalizeMessage = (message: string): string =>
  message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b[0-9a-f]{24}\b/gi, "<id>")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "<str>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .trim();

// V8: "    at fn (file:1:2)" / "    at file:1:2". Firefox/Safari: "fn@file:1:2".
const isFrame = (line: string) => /^\s*at\s/.test(line) || /@.*:\d+:\d+\s*$/.test(line);
const isLibraryFrame = (line: string) => /node_modules|node:internal|\(node:|<anonymous>/.test(line);

/** First stack frame from our own code (falls back to the first frame of any kind). */
export const topFrame = (stack: string | null | undefined): string | null => {
  if (!stack) return null;
  const frames = stack.split("\n").filter(isFrame);
  return (frames.find((f) => !isLibraryFrame(f)) ?? frames[0])?.trim() ?? null;
};

/**
 * Strips what changes between builds and hosts without the error changing:
 * origin, query string, line:column and Vite's 8-char content hashes
 * ("nodes/3.Bqx7z1Ab.js" → "nodes/3.js", "chunks/foo-DkJ3a1Xy.js" → "chunks/foo.js").
 */
export const normalizeFrame = (frame: string): string =>
  frame
    .replace(/https?:\/\/[^/\s)]+/g, "")
    .replace(/\?[^:\s)]*/g, "")
    .replace(/:\d+(:\d+)?(?=\)?\s*$)/, "")
    .replace(/[.-][A-Za-z0-9_-]{8}(?=\.js)/g, "")
    .trim();

const sha1 = (parts: string[]) => createHash("sha1").update(parts.join("\n")).digest("hex");

/**
 * Identifies an event *kind*, independent of who hit it — the group id.
 * - With an explicit code: level + service + code.
 * - Errors without one: service + error type + normalized message + top in-app frame.
 */
export const fingerprint = (input: {
  level: Level;
  service: string;
  code?: string;
  errorType?: string | null;
  message: string;
  stack?: string | null;
}): string => {
  if (input.code) return sha1(["code", input.level, input.service, input.code]);
  const frame = topFrame(input.stack);
  return sha1([
    input.service,
    input.errorType ?? "",
    normalizeMessage(input.message),
    frame ? normalizeFrame(frame) : "",
  ]);
};
