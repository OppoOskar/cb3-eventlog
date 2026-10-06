/** Shapes shared by the server store, the browser reporter and admin UIs. Safe to import anywhere. */
export declare const LEVELS: readonly ["error", "warning", "info"];
export type Level = (typeof LEVELS)[number];
export declare const GROUP_STATUSES: readonly ["open", "resolved"];
export type GroupStatus = (typeof GROUP_STATUSES)[number];
/** Field caps, enforced both when normalizing on the server and when validating a client report. */
export declare const LIMITS: {
    readonly code: 120;
    readonly errorType: 200;
    readonly message: 1000;
    readonly stack: 8000;
    readonly url: 2000;
    readonly route: 200;
    readonly version: 100;
    readonly userAgent: 500;
    /** Serialized size of an event's `data`. */
    readonly dataBytes: 2048;
    readonly dataKeys: 20;
};
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
export interface Paginated<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}
