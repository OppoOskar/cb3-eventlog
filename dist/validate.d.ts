import { type ClientReport, type Level } from "./types.js";
import type { GroupFilter, Pagination } from "./store.js";
type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: string;
};
/**
 * Validates a browser report. Unknown keys are dropped, so a client can't set
 * service, userId or role. Warnings, info and coded errors must use a code from
 * `clientCodes` with its declared level — anonymous pages can post here, so
 * free-form codes would let anyone mint new groups.
 */
export declare const parseClientReport: (raw: unknown, clientCodes: Record<string, Level>) => Result<ClientReport>;
/** `?page=&pageSize=` (1-based); null when out of range so the route can answer 400. */
export declare const parsePagination: (url: URL, defaultSize?: number, maxSize?: number) => Pagination | null;
/** `?level=&status=&service=` for the group list. */
export declare const parseGroupFilter: (url: URL) => Result<GroupFilter>;
/** Path only — query strings can carry tokens (password reset, verify-email). */
export declare const pathOf: (url: string) => string;
export {};
