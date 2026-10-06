import { type GroupStatus, type Level, type LogContext, type LogEventItem, type LogGroupDetail, type LogGroupItem, type Paginated } from "./types.js";
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
export type EventLog = ReturnType<typeof createEventLog>;
export declare const createEventLog: (options: EventLogOptions) => {
    service: string;
    clientCodes: Record<string, "error" | "warning" | "info">;
    error: (err: unknown, ctx?: LogContext) => string;
    warn: (code: string, ctx?: LogContext) => string;
    info: (code: string, ctx?: LogContext) => string;
    errorAsync: (err: unknown, ctx?: LogContext) => {
        eventId: string;
        done: Promise<void>;
    };
    warnAsync: (code: string, ctx?: LogContext) => {
        eventId: string;
        done: Promise<void>;
    };
    infoAsync: (code: string, ctx?: LogContext) => {
        eventId: string;
        done: Promise<void>;
    };
    recordReport: (level: Level, body: {
        code?: string;
        errorType?: string;
        message: string;
        stack: string | null;
    }, ctx: LogContext & {
        eventId: string;
    }) => Promise<void>;
    query: {
        listGroups: (filter: GroupFilter, pagination: Pagination) => Promise<Paginated<LogGroupItem>>;
        getGroup: (id: string) => Promise<LogGroupDetail | null>;
        setGroupStatus: (id: string, status: GroupStatus) => Promise<LogGroupItem | null>;
        getEvent: (eventId: string) => Promise<LogEventItem | null>;
    };
    installProcessHandlers: () => void;
};
