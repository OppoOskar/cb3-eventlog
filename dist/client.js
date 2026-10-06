import { LIMITS } from "./types.js";
const truncate = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
/** Browser/extension noise that isn't ours to fix. */
const isNoise = (message, stack) => {
    if (/ResizeObserver loop/.test(message))
        return true;
    // Cross-origin script errors carry no details at all.
    if (/^Script error\.?$/.test(message) && !stack)
        return true;
    if (stack) {
        const frames = stack.split("\n").filter((l) => /:\d+:\d+/.test(l));
        if (frames.length > 0 && frames.every((l) => /(chrome|moz|safari(-web)?)-extension:\/\//.test(l)))
            return true;
    }
    return false;
};
const normalize = (err) => {
    if (err instanceof Error)
        return { errorType: err.name || "Error", message: err.message, stack: err.stack };
    let message;
    try {
        message = typeof err === "string" ? err : (JSON.stringify(err) ?? String(err));
    }
    catch {
        message = String(err);
    }
    return { errorType: "NonError", message, stack: undefined };
};
/**
 * Browser-side reporter. Every method returns the event id immediately (even
 * when the report is skipped, so callers can still show one) and never throws.
 * Keep the module that creates it free of framework runtime imports — see
 * `installGlobalHandlers`.
 */
export const createClientReporter = (options = {}) => {
    const endpoint = options.endpoint ?? "/api/logs";
    const maxPerPage = options.maxPerPage ?? 10;
    let sent = 0;
    const seen = new Set();
    const send = (level, body, ctx) => {
        const eventId = crypto.randomUUID();
        try {
            if (level === "error" && isNoise(body.message, body.stack))
                return eventId;
            const key = `${level}|${ctx.code ?? ""}|${body.errorType ?? ""}|${body.message}|${body.stack?.split("\n")[1] ?? ""}`;
            if (seen.has(key) || sent >= maxPerPage)
                return eventId;
            seen.add(key);
            sent++;
            const report = {
                eventId,
                level,
                ...(ctx.code && { code: ctx.code }),
                ...(body.errorType && { errorType: truncate(body.errorType, LIMITS.errorType) }),
                message: truncate(body.message, LIMITS.message),
                ...(body.stack && { stack: truncate(body.stack, LIMITS.stack) }),
                url: truncate(location.href, LIMITS.url),
                route: ctx.route ?? null,
                ...(ctx.status !== undefined && { status: ctx.status }),
                ...(options.version && { version: options.version }),
                ...(ctx.data && { data: ctx.data }),
            };
            // keepalive: the report still goes out if it happens while leaving the page.
            fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(report),
                keepalive: true,
            }).catch(() => { });
        }
        catch {
            // The reporter must never become a source of errors itself.
        }
        return eventId;
    };
    const error = (err, ctx = {}) => {
        const n = normalize(err);
        return send("error", { ...n, message: ctx.message ?? n.message }, ctx);
    };
    const warn = (code, ctx = {}) => send("warning", { message: ctx.message ?? code }, { ...ctx, code });
    const info = (code, ctx = {}) => send("info", { message: ctx.message ?? code }, { ...ctx, code });
    /**
     * Reports uncaught errors and unhandled rejections. `getRoute` runs only
     * when something is reported — load framework state (e.g. SvelteKit's
     * `$app/state`) lazily inside it, since the hooks module may be evaluated
     * before the framework runtime is ready.
     */
    const installGlobalHandlers = (opts = {}) => {
        const route = async () => {
            try {
                return (await opts.getRoute?.()) ?? null;
            }
            catch {
                return null;
            }
        };
        window.addEventListener("error", (e) => {
            const err = e.error ?? e.message;
            void route().then((r) => error(err, { route: r }));
        });
        window.addEventListener("unhandledrejection", (e) => {
            void route().then((r) => error(e.reason, { route: r }));
        });
    };
    return { error, warn, info, installGlobalHandlers };
};
//# sourceMappingURL=client.js.map