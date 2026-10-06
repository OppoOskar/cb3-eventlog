import { describe, it, expect } from "vitest";
import { parseClientReport, parseGroupFilter, parsePagination, pathOf } from "./validate.js";
import { sanitizeData } from "./serialize.js";

const CODES = { "upload.failed": "error", "upload.slow": "warning" } as const;
const base = {
  eventId: "3f2b8c1e-9a4d-4e2f-8b1a-0c9d8e7f6a5b",
  message: "boom",
  url: "https://example.test/a?token=x",
};

describe("parseClientReport", () => {
  it("accepts an uncoded error and defaults the level", () => {
    const r = parseClientReport({ ...base, errorType: "TypeError" }, CODES);
    expect(r).toMatchObject({ ok: true, value: { level: "error", errorType: "TypeError", route: null } });
  });

  it("drops fields a client may not set", () => {
    const r = parseClientReport({ ...base, service: "server", userId: "x", role: "manager" }, CODES);
    expect(r.ok && Object.keys(r.value)).not.toContain("service");
    expect(r.ok && Object.keys(r.value)).not.toContain("userId");
  });

  it("requires allow-listed codes for warnings, info and coded errors", () => {
    expect(parseClientReport({ ...base, level: "warning", code: "upload.slow" }, CODES).ok).toBe(true);
    expect(parseClientReport({ ...base, level: "error", code: "upload.failed" }, CODES).ok).toBe(true);
    expect(parseClientReport({ ...base, level: "warning" }, CODES).ok).toBe(false);
    expect(parseClientReport({ ...base, level: "warning", code: "made.up" }, CODES).ok).toBe(false);
    // Allowed code, wrong level.
    expect(parseClientReport({ ...base, level: "info", code: "upload.slow" }, CODES).ok).toBe(false);
    expect(parseClientReport({ ...base, level: "error", code: "made.up" }, CODES).ok).toBe(false);
  });

  it("rejects bad ids, levels, sizes and data", () => {
    expect(parseClientReport({ ...base, eventId: "nope" }, CODES).ok).toBe(false);
    expect(parseClientReport({ ...base, level: "fatal" }, CODES).ok).toBe(false);
    expect(parseClientReport({ ...base, message: "m".repeat(2000) }, CODES).ok).toBe(false);
    expect(parseClientReport({ ...base, status: 42 }, CODES).ok).toBe(false);
    expect(parseClientReport({ ...base, data: { nested: { a: 1 } } }, CODES).ok).toBe(false);
    expect(parseClientReport({ ...base, data: { s: "x".repeat(3000) } }, CODES).ok).toBe(false);
    expect(parseClientReport({ ...base, data: { size: 1, ok: true, ext: ".mov", n: null } }, CODES).ok).toBe(true);
  });
});

describe("parsePagination / parseGroupFilter", () => {
  it("parses and rejects out-of-range values", () => {
    expect(parsePagination(new URL("http://x/?page=2&pageSize=10"))).toEqual({ page: 2, pageSize: 10, skip: 10 });
    expect(parsePagination(new URL("http://x/?page=0"))).toBeNull();
    expect(parsePagination(new URL("http://x/?pageSize=500"))).toBeNull();
    expect(parseGroupFilter(new URL("http://x/?level=warning&status=open")).ok).toBe(true);
    expect(parseGroupFilter(new URL("http://x/?level=fatal")).ok).toBe(false);
  });
});

describe("pathOf / sanitizeData", () => {
  it("strips query strings", () => {
    expect(pathOf("https://example.test/reset?token=secret")).toBe("/reset");
  });

  it("keeps only flat primitives", () => {
    expect(sanitizeData({ a: 1, b: { c: 2 }, d: "x" })).toEqual({ a: 1, d: "x" });
    expect(sanitizeData({ b: {} })).toBeUndefined();
    expect(sanitizeData("nope")).toBeUndefined();
  });
});
