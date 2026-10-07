import { describe, it, expect } from "vitest";
import { alertDueFilter, alertReason, sinceLastAlert } from "./alert.js";

const now = new Date("2026-10-07T12:00:00Z");

describe("alertReason", () => {
  it("is new for a group that was never alerted", () => {
    expect(alertReason({ count: 1 })).toBe("new");
    expect(alertReason({ count: 1, alertedAt: null })).toBe("new");
  });

  it("is reopened when a resolved group recurred", () => {
    expect(alertReason({ count: 9, alertedAt: null, reopenedAt: now })).toBe("reopened");
  });

  it("is a reminder when the group was alerted before", () => {
    expect(alertReason({ count: 9, alertedAt: now, reopenedAt: now })).toBe("reminder");
  });
});

describe("sinceLastAlert", () => {
  it("counts occurrences since the previous alert", () => {
    expect(sinceLastAlert({ count: 42, alertedAt: now, alertedCount: 30 })).toEqual({
      at: now.toISOString(),
      count: 12,
    });
  });

  it("is null without a previous alert", () => {
    expect(sinceLastAlert({ count: 3, alertedAt: null })).toBeNull();
  });
});

describe("alertDueFilter", () => {
  it("matches unalerted groups and those alerted before the reminder cutoff", () => {
    expect(alertDueFilter(now, 24)).toEqual({
      status: "open",
      $or: [{ alertedAt: null }, { alertedAt: { $lte: new Date("2026-10-06T12:00:00Z") } }],
    });
  });

  it("drops the reminder branch when reminders are off", () => {
    expect(alertDueFilter(now, 0)).toEqual({ status: "open", $or: [{ alertedAt: null }] });
  });
});
