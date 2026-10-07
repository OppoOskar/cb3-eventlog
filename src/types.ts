/** Shapes shared by the server store, the browser reporter and admin UIs. Safe to import anywhere. */

export const LEVELS = ["error", "warning", "info"] as const;
export type Level = (typeof LEVELS)[number];

export const GROUP_STATUSES = ["open", "resolved"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

/** Field caps, enforced both when normalizing on the server and when validating a client report. */
export const LIMITS = {
  code: 120,
  errorType: 200,
  message: 1000,
  stack: 8000,
  url: 2000,
  route: 200,
  version: 100,
  userAgent: 500,
  /** Serialized size of an event's `data`. */
  dataBytes: 2048,
  dataKeys: 20,
} as const;

/** Flat, JSON-safe extra fields on an event, e.g. `{ size: 812345678, limit: 786432000, ext: ".mov" }`. */
export type EventData = Record<string, string | number | boolean | null>;

/** Context for a server-side log call. Everything is optional. */
export interface LogContext {
  /** Stable key, e.g. "upload.too_large". Errors without one are grouped by stack instead. */
  code?: string;
  /** Overrides the message (warn/info default to the code). */
  message?: string;
  requestId?: string;
  method?: string;
  /** Path only — never pass query strings, they can carry tokens. */
  url?: string;
  route?: string | null;
  status?: number;
  userId?: unknown;
  role?: string;
  userAgent?: string | null;
  data?: EventData;
  /** Overrides the log's own service name (the SvelteKit ingest route uses this for browser reports). */
  service?: string;
  /** Use a pre-generated id (the browser creates its own so the error page can show it). */
  eventId?: string;
}

/** Body a browser sends to the ingest route. */
export interface ClientReport {
  eventId: string;
  level: Level;
  code?: string;
  errorType?: string;
  message: string;
  stack?: string;
  url: string;
  route?: string | null;
  status?: number;
  version?: string;
  data?: EventData;
}

export interface LogGroupItem {
  id: string;
  level: Level;
  service: string;
  code: string;
  errorType: string | null;
  message: string;
  topFrame: string | null;
  route: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
  lastEventId: string;
  status: GroupStatus;
  resolvedAt: string | null;
}

export interface LogEventItem {
  eventId: string;
  groupId: string;
  level: Level;
  service: string;
  code: string;
  at: string;
  requestId: string | null;
  method: string | null;
  url: string | null;
  route: string | null;
  status: number | null;
  userId: string | null;
  role: string | null;
  userAgent: string | null;
  version: string | null;
  errorType: string | null;
  message: string;
  stack: string | null;
  data: EventData | null;
}

export interface DailyCount {
  /** YYYY-MM-DD (UTC). */
  day: string;
  count: number;
}

export interface LogGroupDetail {
  group: LogGroupItem;
  events: LogEventItem[];
  /** Distinct signed-in users among the group's retained events. */
  affectedUsers: number;
  last24h: number;
  last7d: number;
  last30d: number;
  /** One entry per day for the last 30 days, oldest first, zero-filled. */
  daily: DailyCount[];
}

/**
 * Why an error group needs attention:
 * - `new`: its first occurrence;
 * - `reopened`: it came back after being resolved;
 * - `reminder`: it is still happening, at most once per `alertReminderHours`.
 */
export type AlertReason = "new" | "reopened" | "reminder";

/** Passed to `onAlert`. `group` and `event` are the same shapes the admin API returns. */
export interface EventLogAlert {
  reason: AlertReason;
  group: LogGroupItem;
  /** The occurrence that triggered the alert. */
  event: LogEventItem;
  /** Reminders only: when the previous alert went out and how many occurrences there have been since. */
  sinceLastAlert: { at: string; count: number } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
