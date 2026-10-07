import type { AlertReason } from "./types.js";

/** The alert fields of a group document, as they were just before an alert was claimed. */
export interface AlertState {
  count: number;
  /** When the last alert went out; null/missing after a reopen or if there never was one. */
  alertedAt?: Date | null;
  /** The group's count when the last alert went out. */
  alertedCount?: number;
  /** Set each time an error reopens a resolved group. */
  reopenedAt?: Date | null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Filter that matches a group only when it is due an alert: never alerted since
 * it was created or reopened, or alerted longer ago than the reminder interval.
 * Used in an atomic findOneAndUpdate, so exactly one instance wins each alert.
 */
export const alertDueFilter = (now: Date, reminderHours: number) => ({
  status: "open" as const,
  $or: [
    { alertedAt: null },
    ...(reminderHours > 0 ? [{ alertedAt: { $lte: new Date(now.getTime() - reminderHours * HOUR_MS) } }] : []),
  ],
});

/** Why the claimed alert fires, from the group as it was before the claim. */
export const alertReason = (before: AlertState): AlertReason => {
  if (before.alertedAt instanceof Date) return "reminder";
  return before.reopenedAt instanceof Date ? "reopened" : "new";
};

export const sinceLastAlert = (before: AlertState) =>
  before.alertedAt instanceof Date
    ? { at: before.alertedAt.toISOString(), count: before.count - (before.alertedCount ?? 0) }
    : null;
