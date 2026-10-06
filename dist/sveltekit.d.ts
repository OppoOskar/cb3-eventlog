import type { HandleServerError, RequestEvent, RequestHandler } from "@sveltejs/kit";
import type { EventLog } from "./store.js";
import { type LogContext } from "./types.js";
export interface SvelteKitOptions {
    /** Guards the admin routes (list/group/event). Throw (e.g. kit's `error(403)` or `redirect`) to deny. */
    authorize: (event: RequestEvent) => Promise<void> | void;
    /** The signed-in user, if any — attached to every event from a request. */
    getUser?: (event: RequestEvent) => {
        id: unknown;
        role?: string;
    } | null | undefined;
    getRequestId?: (event: RequestEvent) => string | undefined;
    /** Service name stored on browser reports. Default: `${log.service}-client`. */
    clientService?: string;
    /** Message shown on the error page for unexpected errors. */
    errorMessage?: string;
    notFoundMessage?: string;
}
export declare const createSvelteKitEventlog: (log: EventLog, options: SvelteKitOptions) => {
    ctxFromEvent: (event: RequestEvent, extra?: LogContext) => LogContext;
    handleError: HandleServerError;
    recordServerErrorResponse: (event: RequestEvent, response: Response, prefix?: string) => void;
    /**
     * Route handlers. Wire them up as:
     *   api/logs/+server.ts                  → POST = ingest, GET = list
     *   api/logs/[id]/+server.ts             → GET, PATCH = group
     *   api/logs/events/[eventId]/+server.ts → GET = event
     */
    routes: {
        logs: {
            POST: RequestHandler;
            GET: RequestHandler;
        };
        group: {
            GET: RequestHandler;
            PATCH: RequestHandler;
        };
        event: {
            GET: RequestHandler;
        };
    };
};
