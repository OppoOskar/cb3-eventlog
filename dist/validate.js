import { GROUP_STATUSES, LEVELS, LIMITS } from "./types.js";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9][a-z0-9_.:/-]*$/i;
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v, field, max, required) => {
    if (v === undefined || (v === null && !required)) {
        return required ? { ok: false, error: `${field} is required` } : { ok: true, value: undefined };
    }
    if (typeof v !== "string")
        return { ok: false, error: `${field} must be a string` };
    if (v.length > max)
        return { ok: false, error: `${field} is longer than ${max}` };
    return { ok: true, value: v };
};
const validateData = (v) => {
    if (v === undefined)
        return { ok: true, value: undefined };
    if (!isObject(v))
        return { ok: false, error: "data must be an object" };
    const entries = Object.entries(v);
    if (entries.length > LIMITS.dataKeys)
        return { ok: false, error: `data has more than ${LIMITS.dataKeys} keys` };
    for (const [key, value] of entries) {
        const t = typeof value;
        if (value !== null && t !== "string" && t !== "number" && t !== "boolean") {
            return { ok: false, error: `data.${key} must be a string, number, boolean or null` };
        }
    }
    if (JSON.stringify(v).length > LIMITS.dataBytes)
        return { ok: false, error: "data is too large" };
    return { ok: true, value: v };
};
/**
 * Validates a browser report. Unknown keys are dropped, so a client can't set
 * service, userId or role. Warnings, info and coded errors must use a code from
 * `clientCodes` with its declared level — anonymous pages can post here, so
 * free-form codes would let anyone mint new groups.
 */
export const parseClientReport = (raw, clientCodes) => {
    if (!isObject(raw))
        return { ok: false, error: "Body must be a JSON object" };
    if (typeof raw.eventId !== "string" || !UUID.test(raw.eventId))
        return { ok: false, error: "eventId must be a UUID" };
    const level = raw.level ?? "error";
    if (!LEVELS.includes(level))
        return { ok: false, error: `Unknown level: ${String(level)}` };
    const code = str(raw.code, "code", LIMITS.code, false);
    if (!code.ok)
        return code;
    if (code.value !== undefined && !CODE.test(code.value))
        return { ok: false, error: "Invalid code" };
    if (level !== "error" || code.value !== undefined) {
        if (!code.value)
            return { ok: false, error: `code is required for level ${String(level)}` };
        if (clientCodes[code.value] !== level)
            return { ok: false, error: `Code not accepted from clients: ${code.value}` };
    }
    const errorType = str(raw.errorType, "errorType", LIMITS.errorType, false);
    if (!errorType.ok)
        return errorType;
    const message = str(raw.message, "message", LIMITS.message, true);
    if (!message.ok)
        return message;
    const stack = str(raw.stack, "stack", LIMITS.stack, false);
    if (!stack.ok)
        return stack;
    const url = str(raw.url, "url", LIMITS.url, true);
    if (!url.ok)
        return url;
    const route = str(raw.route, "route", LIMITS.route, false);
    if (!route.ok)
        return route;
    const version = str(raw.version, "version", LIMITS.version, false);
    if (!version.ok)
        return version;
    if (raw.status !== undefined &&
        (typeof raw.status !== "number" || !Number.isInteger(raw.status) || raw.status < 100 || raw.status > 599)) {
        return { ok: false, error: "status must be an HTTP status code" };
    }
    const data = validateData(raw.data);
    if (!data.ok)
        return data;
    return {
        ok: true,
        value: {
            eventId: raw.eventId,
            level: level,
            ...(code.value && { code: code.value }),
            ...(errorType.value && { errorType: errorType.value }),
            message: message.value,
            ...(stack.value && { stack: stack.value }),
            url: url.value,
            route: route.value ?? null,
            ...(raw.status !== undefined && { status: raw.status }),
            ...(version.value && { version: version.value }),
            ...(data.value && { data: data.value }),
        },
    };
};
/** `?page=&pageSize=` (1-based); null when out of range so the route can answer 400. */
export const parsePagination = (url, defaultSize = 25, maxSize = 50) => {
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? defaultSize);
    if (!Number.isInteger(page) || page < 1)
        return null;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxSize)
        return null;
    return { page, pageSize, skip: (page - 1) * pageSize };
};
/** `?level=&status=&service=` for the group list. */
export const parseGroupFilter = (url) => {
    const level = url.searchParams.get("level") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const service = url.searchParams.get("service") || undefined;
    if (level && !LEVELS.includes(level))
        return { ok: false, error: `Unknown level: ${level}` };
    if (status && !GROUP_STATUSES.includes(status))
        return { ok: false, error: `Unknown status: ${status}` };
    if (service && service.length > 100)
        return { ok: false, error: "service is too long" };
    return { ok: true, value: { level: level, status: status, service } };
};
/** Path only — query strings can carry tokens (password reset, verify-email). */
export const pathOf = (url) => {
    try {
        return new URL(url, "http://local").pathname;
    }
    catch {
        return url.split("?")[0] ?? url;
    }
};
//# sourceMappingURL=validate.js.map