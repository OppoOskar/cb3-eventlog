import { describe, it, expect } from "vitest";
import { fingerprint, normalizeFrame, normalizeMessage, topFrame } from "./fingerprint.js";
import { normalizeError } from "./serialize.js";

describe("normalizeMessage", () => {
  it("replaces ids, uuids, quoted values and numbers", () => {
    expect(normalizeMessage('Profile 64f1a2b3c4d5e6f7a8b9c0d1 not found')).toBe("Profile <id> not found");
    expect(normalizeMessage("Ticket 3f2b8c1e-9a4d-4e2f-8b1a-0c9d8e7f6a5b expired")).toBe("Ticket <uuid> expired");
    expect(normalizeMessage(`Cannot read properties of undefined (reading 'name')`)).toBe(
      "Cannot read properties of undefined (reading <str>)"
    );
    expect(normalizeMessage("Expected 3 items, got 12")).toBe("Expected <n> items, got <n>");
  });
});

describe("topFrame", () => {
  const stack = [
    "TypeError: x is undefined",
    "    at Object.get (/app/node_modules/mongodb/lib/foo.js:10:5)",
    "    at load (/app/build/server/chunks/_page.server-DkJ3a1Xy.js:42:17)",
  ].join("\n");

  it("prefers the first frame from our own code", () => {
    expect(topFrame(stack)).toBe("at load (/app/build/server/chunks/_page.server-DkJ3a1Xy.js:42:17)");
  });

  it("handles Firefox/Safari frames", () => {
    expect(topFrame("onclick@https://cb3.oppotunity.se/_app/immutable/nodes/3.Bqx7z1Ab.js:1:2345")).toBe(
      "onclick@https://cb3.oppotunity.se/_app/immutable/nodes/3.Bqx7z1Ab.js:1:2345"
    );
  });

  it("returns null without a stack", () => {
    expect(topFrame(null)).toBeNull();
  });
});

describe("normalizeFrame", () => {
  it("strips origin, line:col and build hashes", () => {
    expect(normalizeFrame("at load (/app/build/server/chunks/_page.server-DkJ3a1Xy.js:42:17)")).toBe(
      "at load (/app/build/server/chunks/_page.server.js)"
    );
    expect(normalizeFrame("onclick@https://cb3.oppotunity.se/_app/immutable/nodes/3.Bqx7z1Ab.js?v=1:1:2345")).toBe(
      "onclick@/_app/immutable/nodes/3.js"
    );
  });
});

describe("fingerprint", () => {
  const base = {
    level: "error" as const,
    service: "cbp3",
    errorType: "TypeError",
    message: "Profile 64f1a2b3c4d5e6f7a8b9c0d1 not found",
    stack: "TypeError: …\n    at load (/app/build/server/chunks/a-DkJ3a1Xy.js:42:17)",
  };

  it("is stable across ids, line numbers and builds", () => {
    expect(
      fingerprint({
        ...base,
        message: "Profile 650000000000000000000000 not found",
        stack: "TypeError: …\n    at load (/app/build/server/chunks/a-Zz99Yy88.js:50:3)",
      })
    ).toBe(fingerprint(base));
  });

  it("differs by service, type and location", () => {
    expect(fingerprint({ ...base, service: "cbp3-client" })).not.toBe(fingerprint(base));
    expect(fingerprint({ ...base, errorType: "RangeError" })).not.toBe(fingerprint(base));
    expect(fingerprint({ ...base, stack: "TypeError: …\n    at other (/app/b.js:1:1)" })).not.toBe(
      fingerprint(base)
    );
  });
});

describe("normalizeError", () => {
  it("keeps Error name, message and stack", () => {
    const err = new RangeError("boom");
    expect(normalizeError(err)).toMatchObject({ errorType: "RangeError", message: "boom" });
    expect(normalizeError(err).stack).toContain("boom");
  });

  it("handles non-Error throws", () => {
    expect(normalizeError("plain")).toEqual({ errorType: "NonError", message: "plain", stack: null });
    expect(normalizeError({ code: 1 })).toEqual({ errorType: "NonError", message: '{"code":1}', stack: null });
  });

  it("truncates long messages", () => {
    expect(normalizeError(new Error("x".repeat(5000))).message.length).toBe(1000);
  });
});

describe("fingerprint with a code", () => {
  const coded = { level: "warning" as const, service: "cbp3", code: "upload.too_large", message: "File too large" };

  it("groups by level, service and code only", () => {
    expect(fingerprint({ ...coded, message: "something else", stack: "x\n    at a (/b.js:1:1)" })).toBe(
      fingerprint(coded)
    );
  });

  it("separates levels, services and codes", () => {
    expect(fingerprint({ ...coded, level: "info" })).not.toBe(fingerprint(coded));
    expect(fingerprint({ ...coded, service: "media-worker" })).not.toBe(fingerprint(coded));
    expect(fingerprint({ ...coded, code: "upload.unsupported_type" })).not.toBe(fingerprint(coded));
  });
});
