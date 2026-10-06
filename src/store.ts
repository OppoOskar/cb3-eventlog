import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { fingerprint, topFrame } from "./fingerprint.js";
import { EVENT_COLLECTION, GROUP_COLLECTION } from "./indexes.js";
import { normalizeError, sanitizeData, truncate } from "./serialize.js";
import {
  LIMITS,
  type DailyCount,
  type EventData,
  type GroupStatus,
  type Level,
  type LogContext,
  type LogEventItem,
  type LogGroupDetail,
  type LogGroupItem,
  type Paginated,
} from "./types.js";

/** One document per event *kind*; `_id` is the fingerprint, so concurrent first reports can't create two groups. */
interface GroupDoc {
  _id: string;
  level: Level;
  service: string;
  code: string;
  errorType: string | null;
  message: string;
  topFrame: string | null;
  route: string | null;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  lastEventId: string;
  status: GroupStatus;
  resolvedAt: Date | null;
}

/** One document per occurrence; deleted at `expiresAt`. */
interface EventDoc {
  _id: string;
  groupId: string;
  level: Level;
  service: string;
  code: string;
  at: Date;
  expiresAt: Date;
  requestId?: string;
  method?: string;
  url?: string;
  route?: string;
  status?: number;
  userId?: unknown;
  role?: string;
  userAgent?: string;
  version?: string;
  errorType?: string;
  message: string;
  stack: string | null;
  data?: EventData;
}

/**
 * Anything with `collection(name)` — a mongodb `Db`. Typed structurally so an
 * app's driver copy never has to match this package's (linked installs, minor
 * version drift).
 */
export interface DbLike {
  collection(name: string): unknown;
}

export interface EventLogOptions {
  db: DbLike;
  /** Name of the emitting service, e.g. "cbp3" or "media-worker". */
  service: string;
  /** Build/deploy id stored on every event. */
  version?: string;
  /** Days each level's events are kept. Groups are kept forever. */
  retentionDays?: Partial<Record<Level, number>>;
  /** Codes browsers may report, with the level each must use. See validate.ts. */
  clientCodes?: Record<string, Level>;
}

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
}

export interface GroupFilter {
  level?: Level;
  status?: GroupStatus;
  service?: string;
}

const DEFAULT_RETENTION: Record<Level, number> = { error: 30, warning: 90, info: 30 };
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EVENTS = 20;
const SERIES_DAYS = 30;

// Checked by code, not `instanceof MongoServerError`: the app's driver copy may
// differ from the one this package resolves (linked installs).
const isDuplicateKey = (err: unknown) => (err as { code?: unknown } | null)?.code === 11000;
const opt = <K extends string, V>(key: K, value: V | null | undefined) =>
  (value === undefined || value === null || value === "" ? {} : { [key]: value }) as Partial<Record<K, V>>;

const serializeGroup = (doc: GroupDoc): LogGroupItem => ({
  id: doc._id,
  level: doc.level,
  service: doc.service,
  code: doc.code,
  errorType: doc.errorType,
  message: doc.message,
  topFrame: doc.topFrame,
  route: doc.route,
  count: doc.count,
  firstSeen: doc.firstSeen.toISOString(),
  lastSeen: doc.lastSeen.toISOString(),
  lastEventId: doc.lastEventId,
  status: doc.status,
  resolvedAt: doc.resolvedAt?.toISOString() ?? null,
});

const serializeEvent = (doc: EventDoc): LogEventItem => ({
  eventId: doc._id,
  groupId: doc.groupId,
  level: doc.level,
  service: doc.service,
  code: doc.code,
  at: doc.at.toISOString(),
  requestId: doc.requestId ?? null,
  method: doc.method ?? null,
  url: doc.url ?? null,
  route: doc.route ?? null,
  status: doc.status ?? null,
  userId: doc.userId == null ? null : String(doc.userId),
  role: doc.role ?? null,
  userAgent: doc.userAgent ?? null,
  version: doc.version ?? null,
  errorType: doc.errorType ?? null,
  message: doc.message,
  stack: doc.stack,
  data: doc.data ?? null,
});

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export type EventLog = ReturnType<typeof createEventLog>;

export const createEventLog = (options: EventLogOptions) => {
  const groups = options.db.collection(GROUP_COLLECTION) as Collection<GroupDoc>;
  const events = options.db.collection(EVENT_COLLECTION) as Collection<EventDoc>;
  const retention = { ...DEFAULT_RETENTION, ...options.retentionDays };

  const write = async (
    level: Level,
    eventId: string,
    body: { code?: string; errorType?: string; message: string; stack: string | null },
    ctx: LogContext
  ) => {
    const service = ctx.service ?? options.service;
    const code = body.code ? truncate(body.code, LIMITS.code) : (body.errorType ?? "Error");
    const groupId = fingerprint({ level, service, code: body.code, ...body });
    const at = new Date();
    const data = sanitizeData(ctx.data);

    // Event first: a resent report (same id) is a no-op and doesn't double count.
    try {
      await events.insertOne({
        _id: eventId,
        groupId,
        level,
        service,
        code,
        at,
        expiresAt: new Date(at.getTime() + retention[level] * DAY_MS),
        ...opt("requestId", ctx.requestId),
        ...opt("method", ctx.method),
        ...opt("url", ctx.url && truncate(ctx.url, LIMITS.url)),
        ...opt("route", ctx.route),
        ...opt("status", ctx.status),
        ...opt("userId", ctx.userId),
        ...opt("role", ctx.role),
        ...opt("userAgent", ctx.userAgent && truncate(ctx.userAgent, LIMITS.userAgent)),
        ...opt("version", options.version),
        ...opt("errorType", body.errorType),
        message: body.message,
        stack: body.stack,
        ...opt("data", data),
      });
    } catch (err) {
      if (isDuplicateKey(err)) return;
      throw err;
    }

    // Pipeline update so count/firstSeen work for insert and update alike.
    // Report values go through $literal — a message starting with "$" would
    // otherwise be read as a field path. A recurring error reopens its group
    // (a regression); warnings and info keep whatever status they have.
    const reopen = level === "error";
    const upsert = () =>
      groups.updateOne(
        { _id: groupId },
        [
          {
            $set: {
              level: { $literal: level },
              service: { $literal: service },
              code: { $literal: code },
              errorType: { $literal: body.errorType ?? null },
              message: { $literal: body.message },
              topFrame: { $literal: topFrame(body.stack) },
              route: { $literal: ctx.route ?? null },
              count: { $add: [{ $ifNull: ["$count", 0] }, 1] },
              firstSeen: { $ifNull: ["$firstSeen", at] },
              lastSeen: at,
              lastEventId: { $literal: eventId },
              status: reopen ? "open" : { $ifNull: ["$status", "open"] },
              resolvedAt: reopen ? null : { $ifNull: ["$resolvedAt", null] },
            },
          },
        ],
        { upsert: true }
      );
    try {
      await upsert();
    } catch (err) {
      // Two instances inserting the same new group at once: one wins, the other retries as an update.
      if (!isDuplicateKey(err)) throw err;
      await upsert();
    }
  };

  /** Never throws — the logger must not be able to cause errors of its own (or loop on them). */
  const safeWrite = async (...args: Parameters<typeof write>) => {
    try {
      await write(...args);
    } catch (err) {
      console.error("[eventlog] Failed to record event:", err, "original:", args[2].message);
    }
  };

  const logLine = (level: Level, eventId: string, fields: Record<string, unknown>) => {
    const line = JSON.stringify({ level, at: new Date().toISOString(), service: options.service, eventId, ...fields });
    if (level === "error") console.error(line);
    else if (level === "warning") console.warn(line);
    else console.info(line);
  };

  /**
   * Records an error. Grouped by stack unless `ctx.code` is given. Returns the
   * event id (show it to the user as a reference). Fire-and-forget; use
   * `errorAsync` to wait for the write.
   */
  const errorAsync = (err: unknown, ctx: LogContext = {}) => {
    const eventId = ctx.eventId ?? randomUUID();
    const normalized = normalizeError(err);
    const message = ctx.message ? truncate(ctx.message, LIMITS.message) : normalized.message;
    logLine("error", eventId, { ...ctx, ...normalized, message, userId: ctx.userId == null ? undefined : String(ctx.userId) });
    const done = safeWrite("error", eventId, { ...normalized, message, code: ctx.code }, ctx);
    return { eventId, done };
  };

  const eventAsync = (level: "warning" | "info", code: string, ctx: LogContext = {}) => {
    const eventId = ctx.eventId ?? randomUUID();
    const message = truncate(ctx.message ?? code, LIMITS.message);
    logLine(level, eventId, { code, message, route: ctx.route, status: ctx.status, data: ctx.data });
    const done = safeWrite(level, eventId, { code, message, stack: null }, ctx);
    return { eventId, done };
  };

  /** Writes a report that has already been validated (the ingest route) — no console line. */
  const recordReport = (
    level: Level,
    body: { code?: string; errorType?: string; message: string; stack: string | null },
    ctx: LogContext & { eventId: string }
  ) => safeWrite(level, ctx.eventId, body, ctx);

  const listGroups = async (
    filter: GroupFilter,
    pagination: Pagination
  ): Promise<Paginated<LogGroupItem>> => {
    const query = { ...opt("level", filter.level), ...opt("status", filter.status), ...opt("service", filter.service) };
    const [docs, total] = await Promise.all([
      groups.find(query).sort({ lastSeen: -1 }).skip(pagination.skip).limit(pagination.pageSize).toArray(),
      groups.countDocuments(query),
    ]);
    return { items: docs.map(serializeGroup), total, page: pagination.page, pageSize: pagination.pageSize };
  };

  const getGroup = async (id: string): Promise<LogGroupDetail | null> => {
    const doc = await groups.findOne({ _id: id });
    if (!doc) return null;

    const now = Date.now();
    const since = (ms: number) => ({ groupId: id, at: { $gte: new Date(now - ms) } });
    const seriesStart = new Date(now - (SERIES_DAYS - 1) * DAY_MS);
    seriesStart.setUTCHours(0, 0, 0, 0);

    const [recent, users, last24h, last7d, last30d, perDay] = await Promise.all([
      events.find({ groupId: id }).sort({ at: -1 }).limit(RECENT_EVENTS).toArray(),
      events.distinct("userId", { groupId: id, userId: { $exists: true } }),
      events.countDocuments(since(DAY_MS)),
      events.countDocuments(since(7 * DAY_MS)),
      events.countDocuments(since(30 * DAY_MS)),
      events
        .aggregate<{ _id: string; count: number }>([
          { $match: { groupId: id, at: { $gte: seriesStart } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const counts = new Map(perDay.map((d) => [d._id, d.count]));
    const daily: DailyCount[] = Array.from({ length: SERIES_DAYS }, (_, i) => {
      const day = dayKey(new Date(seriesStart.getTime() + i * DAY_MS));
      return { day, count: counts.get(day) ?? 0 };
    });

    return {
      group: serializeGroup(doc),
      events: recent.map(serializeEvent),
      affectedUsers: users.length,
      last24h,
      last7d,
      last30d,
      daily,
    };
  };

  const setGroupStatus = async (id: string, status: GroupStatus): Promise<LogGroupItem | null> => {
    const doc = await groups.findOneAndUpdate(
      { _id: id },
      { $set: { status, resolvedAt: status === "resolved" ? new Date() : null } },
      { returnDocument: "after" }
    );
    return doc ? serializeGroup(doc) : null;
  };

  const getEvent = async (eventId: string): Promise<LogEventItem | null> => {
    const doc = await events.findOne({ _id: eventId });
    return doc ? serializeEvent(doc) : null;
  };

  const INSTALLED = Symbol.for("cb3.eventlog.processHandlers");

  /**
   * Records errors raised outside any request (timers, fire-and-forget promises).
   *
   * Listening for unhandledRejection replaces Node's default of crashing the
   * process: a stray rejected promise is recorded instead of taking every
   * in-flight request down with it. Code that *wants* to crash must call
   * process.exit itself. Uncaught exceptions are recorded, then the process exits.
   */
  const installProcessHandlers = () => {
    // Re-evaluated modules (dev HMR) must not register twice.
    const g = globalThis as { [INSTALLED]?: boolean };
    if (g[INSTALLED]) return;
    g[INSTALLED] = true;

    process.on("unhandledRejection", (reason) => {
      errorAsync(reason, { route: "process:unhandledRejection" });
    });
    process.on("uncaughtException", (err) => {
      const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
      const { done } = errorAsync(err, { route: "process:uncaughtException" });
      void Promise.race([done, timeout]).finally(() => process.exit(1));
    });
  };

  return {
    service: options.service,
    clientCodes: options.clientCodes ?? {},
    error: (err: unknown, ctx?: LogContext) => errorAsync(err, ctx).eventId,
    warn: (code: string, ctx?: LogContext) => eventAsync("warning", code, ctx).eventId,
    info: (code: string, ctx?: LogContext) => eventAsync("info", code, ctx).eventId,
    errorAsync,
    warnAsync: (code: string, ctx?: LogContext) => eventAsync("warning", code, ctx),
    infoAsync: (code: string, ctx?: LogContext) => eventAsync("info", code, ctx),
    recordReport,
    query: { listGroups, getGroup, setGroupStatus, getEvent },
    installProcessHandlers,
  };
};
