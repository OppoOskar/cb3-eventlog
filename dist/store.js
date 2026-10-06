import { randomUUID } from "node:crypto";
import { fingerprint, topFrame } from "./fingerprint.js";
import { EVENT_COLLECTION, GROUP_COLLECTION } from "./indexes.js";
import { normalizeError, sanitizeData, truncate } from "./serialize.js";
import { LIMITS, } from "./types.js";
const DEFAULT_RETENTION = { error: 30, warning: 90, info: 30 };
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EVENTS = 20;
const SERIES_DAYS = 30;
// Checked by code, not `instanceof MongoServerError`: the app's driver copy may
// differ from the one this package resolves (linked installs).
const isDuplicateKey = (err) => err?.code === 11000;
const opt = (key, value) => (value === undefined || value === null || value === "" ? {} : { [key]: value });
const serializeGroup = (doc) => ({
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
const serializeEvent = (doc) => ({
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
const dayKey = (d) => d.toISOString().slice(0, 10);
export const createEventLog = (options) => {
    const groups = options.db.collection(GROUP_COLLECTION);
    const events = options.db.collection(EVENT_COLLECTION);
    const retention = { ...DEFAULT_RETENTION, ...options.retentionDays };
    const write = async (level, eventId, body, ctx) => {
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
        }
        catch (err) {
            if (isDuplicateKey(err))
                return;
            throw err;
        }
        // Pipeline update so count/firstSeen work for insert and update alike.
        // Report values go through $literal — a message starting with "$" would
        // otherwise be read as a field path. A recurring error reopens its group
        // (a regression); warnings and info keep whatever status they have.
        const reopen = level === "error";
        const upsert = () => groups.updateOne({ _id: groupId }, [
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
        ], { upsert: true });
        try {
            await upsert();
        }
        catch (err) {
            // Two instances inserting the same new group at once: one wins, the other retries as an update.
            if (!isDuplicateKey(err))
                throw err;
            await upsert();
        }
    };
    /** Never throws — the logger must not be able to cause errors of its own (or loop on them). */
    const safeWrite = async (...args) => {
        try {
            await write(...args);
        }
        catch (err) {
            console.error("[eventlog] Failed to record event:", err, "original:", args[2].message);
        }
    };
    const logLine = (level, eventId, fields) => {
        const line = JSON.stringify({ level, at: new Date().toISOString(), service: options.service, eventId, ...fields });
        if (level === "error")
            console.error(line);
        else if (level === "warning")
            console.warn(line);
        else
            console.info(line);
    };
    /**
     * Records an error. Grouped by stack unless `ctx.code` is given. Returns the
     * event id (show it to the user as a reference). Fire-and-forget; use
     * `errorAsync` to wait for the write.
     */
    const errorAsync = (err, ctx = {}) => {
        const eventId = ctx.eventId ?? randomUUID();
        const normalized = normalizeError(err);
        const message = ctx.message ? truncate(ctx.message, LIMITS.message) : normalized.message;
        logLine("error", eventId, { ...ctx, ...normalized, message, userId: ctx.userId == null ? undefined : String(ctx.userId) });
        const done = safeWrite("error", eventId, { ...normalized, message, code: ctx.code }, ctx);
        return { eventId, done };
    };
    const eventAsync = (level, code, ctx = {}) => {
        const eventId = ctx.eventId ?? randomUUID();
        const message = truncate(ctx.message ?? code, LIMITS.message);
        logLine(level, eventId, { code, message, route: ctx.route, status: ctx.status, data: ctx.data });
        const done = safeWrite(level, eventId, { code, message, stack: null }, ctx);
        return { eventId, done };
    };
    /** Writes a report that has already been validated (the ingest route) — no console line. */
    const recordReport = (level, body, ctx) => safeWrite(level, ctx.eventId, body, ctx);
    const listGroups = async (filter, pagination) => {
        const query = { ...opt("level", filter.level), ...opt("status", filter.status), ...opt("service", filter.service) };
        const [docs, total] = await Promise.all([
            groups.find(query).sort({ lastSeen: -1 }).skip(pagination.skip).limit(pagination.pageSize).toArray(),
            groups.countDocuments(query),
        ]);
        return { items: docs.map(serializeGroup), total, page: pagination.page, pageSize: pagination.pageSize };
    };
    const getGroup = async (id) => {
        const doc = await groups.findOne({ _id: id });
        if (!doc)
            return null;
        const now = Date.now();
        const since = (ms) => ({ groupId: id, at: { $gte: new Date(now - ms) } });
        const seriesStart = new Date(now - (SERIES_DAYS - 1) * DAY_MS);
        seriesStart.setUTCHours(0, 0, 0, 0);
        const [recent, users, last24h, last7d, last30d, perDay] = await Promise.all([
            events.find({ groupId: id }).sort({ at: -1 }).limit(RECENT_EVENTS).toArray(),
            events.distinct("userId", { groupId: id, userId: { $exists: true } }),
            events.countDocuments(since(DAY_MS)),
            events.countDocuments(since(7 * DAY_MS)),
            events.countDocuments(since(30 * DAY_MS)),
            events
                .aggregate([
                { $match: { groupId: id, at: { $gte: seriesStart } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, count: { $sum: 1 } } },
            ])
                .toArray(),
        ]);
        const counts = new Map(perDay.map((d) => [d._id, d.count]));
        const daily = Array.from({ length: SERIES_DAYS }, (_, i) => {
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
    const setGroupStatus = async (id, status) => {
        const doc = await groups.findOneAndUpdate({ _id: id }, { $set: { status, resolvedAt: status === "resolved" ? new Date() : null } }, { returnDocument: "after" });
        return doc ? serializeGroup(doc) : null;
    };
    const getEvent = async (eventId) => {
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
        const g = globalThis;
        if (g[INSTALLED])
            return;
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
        error: (err, ctx) => errorAsync(err, ctx).eventId,
        warn: (code, ctx) => eventAsync("warning", code, ctx).eventId,
        info: (code, ctx) => eventAsync("info", code, ctx).eventId,
        errorAsync,
        warnAsync: (code, ctx) => eventAsync("warning", code, ctx),
        infoAsync: (code, ctx) => eventAsync("info", code, ctx),
        recordReport,
        query: { listGroups, getGroup, setGroupStatus, getEvent },
        installProcessHandlers,
    };
};
//# sourceMappingURL=store.js.map