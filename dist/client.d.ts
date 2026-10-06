import { type EventData } from "./types.js";
export interface ClientReporterOptions {
    /** Ingest route. Default "/api/logs". */
    endpoint?: string;
    /** Build id sent with every report. */
    version?: string;
    /** Reports sent per page load at most. Default 10. */
    maxPerPage?: number;
}
export interface ClientContext {
    /** Required for warn/info; must be one of the server's `clientCodes`. */
    code?: string;
    message?: string;
    route?: string | null;
    status?: number;
    data?: EventData;
}
/**
 * Browser-side reporter. Every method returns the event id immediately (even
 * when the report is skipped, so callers can still show one) and never throws.
 * Keep the module that creates it free of framework runtime imports — see
 * `installGlobalHandlers`.
 */
export declare const createClientReporter: (options?: ClientReporterOptions) => {
    error: (err: unknown, ctx?: ClientContext) => string;
    warn: (code: string, ctx?: Omit<ClientContext, "code">) => string;
    info: (code: string, ctx?: Omit<ClientContext, "code">) => string;
    installGlobalHandlers: (opts?: {
        getRoute?: () => Promise<string | null> | string | null;
    }) => void;
};
export type ClientReporter = ReturnType<typeof createClientReporter>;
