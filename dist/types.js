/** Shapes shared by the server store, the browser reporter and admin UIs. Safe to import anywhere. */
export const LEVELS = ["error", "warning", "info"];
export const GROUP_STATUSES = ["open", "resolved"];
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
};
//# sourceMappingURL=types.js.map