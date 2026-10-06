import type { EventLog } from "./store.js";
import { type LogContext } from "./types.js";
/**
 * The parts of SvelteKit's RequestEvent this adapter uses. Declared here
 * (structurally) instead of importing @sveltejs/kit, so the package carries no
 * second copy of kit/svelte types into the app. Pass the app's own
 * `RequestEvent` as the type parameter to get typed `locals` in callbacks.
 */
export interface KitEvent {
    request: Request;
    url: URL;
    route: {
        id: string | null;
    };
    params: Partial<Record<string, string>>;
}
export interface SvelteKitOptions<E extends KitEvent> {
    /** Guards the admin routes (list/group/event). Throw (e.g. kit's `error(403)` or `redirect`) to deny. */
    authorize: (event: E) => Promise<void> | void;
    /** The signed-in user, if any — attached to every event from a request. */
    getUser?: (event: E) => {
        id: unknown;
        role?: string;
    } | null | undefined;
    getRequestId?: (event: E) => string | undefined;
    /** Service name stored on browser reports. Default: `${log.service}-client`. */
    clientService?: string;
    /** Message shown on the error page for unexpected errors. */
    errorMessage?: string;
    notFoundMessage?: string;
}
type Handler<E> = (event: E) => Promise<Response>;
export declare const createSvelteKitEventlog: <E extends KitEvent = KitEvent>(log: EventLog, options: SvelteKitOptions<E>) => {
    ctxFromEvent: (event: E, extra?: LogContext) => LogContext;
    handleError: ({ error, event, status }: {
        error: unknown;
        event: E;
        status: number;
        message: string;
    }) => {
        message: string;
        errorId?: string;
    };
    recordServerErrorResponse: (event: E, response: Response, prefix?: string) => void;
    /**
     * Route handlers. Wire them up as:
     *   api/logs/+server.ts                  → POST = ingest, GET = list
     *   api/logs/[id]/+server.ts             → GET, PATCH = group
     *   api/logs/events/[eventId]/+server.ts → GET = event
     */
    routes: {
        logs: {
            POST: Handler<E>;
            GET: Handler<E>;
        };
        group: {
            GET: Handler<E>;
            PATCH: Handler<E>;
        };
        event: {
            GET: Handler<E>;
        };
    };
};
export {};
