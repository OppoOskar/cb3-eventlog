import type { EventLog } from "./store.js";
import { GROUP_STATUSES, type GroupStatus, type LogContext } from "./types.js";
import { parseClientReport, parseGroupFilter, parsePagination, pathOf } from "./validate.js";
import { truncate } from "./serialize.js";
import { LIMITS } from "./types.js";

/**
 * The parts of SvelteKit's RequestEvent this adapter uses. Declared here
 * (structurally) instead of importing @sveltejs/kit, so the package carries no
 * second copy of kit/svelte types into the app. Pass the app's own
 * `RequestEvent` as the type parameter to get typed `locals` in callbacks.
 */
export interface KitEvent {
  request: Request;
  url: URL;
  route: { id: string | null };
  params: Partial<Record<string, string>>;
}

export interface SvelteKitOptions<E extends KitEvent> {
  /** Guards the admin routes (list/group/event). Throw (e.g. kit's `error(403)` or `redirect`) to deny. */
  authorize: (event: E) => Promise<void> | void;
  /** The signed-in user, if any — attached to every event from a request. */
  getUser?: (event: E) => { id: unknown; role?: string } | null | undefined;
  getRequestId?: (event: E) => string | undefined;
  /** Service name stored on browser reports. Default: `${log.service}-client`. */
  clientService?: string;
  /** Message shown on the error page for unexpected errors. */
  errorMessage?: string;
  notFoundMessage?: string;
}

const MAX_BODY_BYTES = 32 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fail = (error: string, status = 400) => json({ success: false, error }, status);

type Handler<E> = (event: E) => Promise<Response>;

export const createSvelteKitEventlog = <E extends KitEvent = KitEvent>(log: EventLog, options: SvelteKitOptions<E>) => {
  /** Requests already logged by handleError, so the 5xx check doesn't log them twice. */
  const reported = new WeakSet<Request>();

  /** Request context for a log call: route, method, path, user, request id, user agent. */
  const ctxFromEvent = (event: E, extra: LogContext = {}): LogContext => {
    const user = options.getUser?.(event);
    return {
      requestId: options.getRequestId?.(event),
      method: event.request.method,
      url: event.url.pathname,
      route: event.route.id,
      userId: user?.id ?? undefined,
      role: user?.role,
      userAgent: event.request.headers.get("user-agent"),
      ...extra,
    };
  };

  /** Use as `export const handleError: HandleServerError = eventlog.handleError` in hooks.server.ts. */
  const handleError = ({ error, event, status }: { error: unknown; event: E; status: number; message: string }) => {
    // Unknown routes also land here — not worth recording.
    if (status === 404) return { message: options.notFoundMessage ?? "Not found" } as { message: string; errorId?: string };
    reported.add(event.request);
    const errorId = log.error(error, ctxFromEvent(event, { status }));
    return { message: options.errorMessage ?? "Something went wrong", errorId };
  };

  /**
   * Call from `handle` after `resolve`: records 5xx responses under `prefix`
   * that no thrown error accounted for (routes that *return* a 500).
   */
  const recordServerErrorResponse = (event: E, response: Response, prefix = "/api/") => {
    if (response.status < 500 || reported.has(event.request) || !event.url.pathname.startsWith(prefix)) return;
    const route = event.route.id ?? event.url.pathname;
    log.error(new Error(`${event.request.method} ${route} responded ${response.status}`), {
      ...ctxFromEvent(event),
      code: `http.5xx:${route}`,
      status: response.status,
    });
  };

  const ingest: Handler<E> = async (event) => {
    const body = await event.request.text();
    if (body.length > MAX_BODY_BYTES) return fail("Payload too large", 413);

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return fail("Invalid JSON");
    }

    const parsed = parseClientReport(raw, log.clientCodes);
    if (!parsed.ok) return fail(parsed.error);
    const report = parsed.value;
    const user = options.getUser?.(event);
    const userAgent = event.request.headers.get("user-agent");

    await log.recordReport(
      report.level,
      {
        code: report.code,
        errorType: report.errorType ?? (report.level === "error" ? "Error" : undefined),
        message: report.message || report.code || "(no message)",
        stack: report.stack ?? null,
      },
      {
        eventId: report.eventId,
        service: options.clientService ?? `${log.service}-client`,
        url: pathOf(report.url),
        route: report.route ?? undefined,
        status: report.status,
        userId: user?.id ?? undefined,
        role: user?.role,
        userAgent: userAgent ? truncate(userAgent, LIMITS.userAgent) : null,
        data: report.data,
      }
    );
    return new Response(null, { status: 204 });
  };

  const list: Handler<E> = async (event) => {
    await options.authorize(event);
    const pagination = parsePagination(event.url);
    if (!pagination) return fail("Invalid page or pageSize");
    const filter = parseGroupFilter(event.url);
    if (!filter.ok) return fail(filter.error);
    return json(await log.query.listGroups(filter.value, pagination));
  };

  const getGroup: Handler<E> = async (event) => {
    await options.authorize(event);
    const detail = await log.query.getGroup(event.params.id ?? "");
    return detail ? json(detail) : fail("Not found", 404);
  };

  const patchGroup: Handler<E> = async (event) => {
    await options.authorize(event);
    const body = (await event.request.json().catch(() => null)) as { status?: unknown } | null;
    if (!body || !GROUP_STATUSES.includes(body.status as GroupStatus)) {
      return fail(`status must be one of: ${GROUP_STATUSES.join(", ")}`);
    }
    const group = await log.query.setGroupStatus(event.params.id ?? "", body.status as GroupStatus);
    return group ? json({ success: true, group }) : fail("Not found", 404);
  };

  const getEvent: Handler<E> = async (event) => {
    await options.authorize(event);
    const found = await log.query.getEvent((event.params.eventId ?? "").trim());
    return found ? json(found) : fail("Not found", 404);
  };

  return {
    ctxFromEvent,
    handleError,
    recordServerErrorResponse,
    /**
     * Route handlers. Wire them up as:
     *   api/logs/+server.ts                  → POST = ingest, GET = list
     *   api/logs/[id]/+server.ts             → GET, PATCH = group
     *   api/logs/events/[eventId]/+server.ts → GET = event
     */
    routes: {
      logs: { POST: ingest, GET: list },
      group: { GET: getGroup, PATCH: patchGroup },
      event: { GET: getEvent },
    },
  };
};
