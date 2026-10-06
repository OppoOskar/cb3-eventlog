# @cb3/eventlog

Errors, warnings and info events, grouped by kind and stored in MongoDB (`logGroup`, `logEvent`). Used by cbp3, which also shows them in `/admin/logs`, and by media-worker. Both write to the same database.

## Install

cbp3 and media-worker depend on the sibling checkout: `link:../cb3-eventlog` (pnpm) and `file:../cb3-eventlog` (npm). Their Docker builds take this folder as a named build context (`--build-context eventlog-src=../cb3-eventlog`, or `additional_contexts` in docker-compose) and build the package from `src/`.

The build **fails** in three cases:
- the context is missing;
- this checkout has uncommitted changes or untracked files that aren't ignored;
- the package doesn't compile.

So whatever goes live is always a committed state of this repo.

## Server

```ts
import { createEventLog, EVENTLOG_INDEXES } from "@cb3/eventlog";

const log = createEventLog({ db, service: "media-worker", version: process.env.APP_VERSION });
log.installProcessHandlers(); // unhandled rejections are recorded instead of crashing

log.error(err, { route: "processVideo", data: { mediaId } });            // grouped by stack
log.warn("upload.too_large", { status: 413, data: { size, limit } });     // grouped by code
log.info("upload.resumed");
```

- Every call is fire-and-forget, never throws, and returns the event id. `errorAsync`, `warnAsync` and `infoAsync` also return `done`, a promise that settles when the write does.
- Groups are keyed by a fingerprint:
  - with a code: level + service + code;
  - errors without a code: service + error type + normalized message + top in-app frame.
- An error group reopens when the error recurs.
- Events expire after 30 days (errors, info) or 90 days (warnings). Groups are kept forever.
- Index creation is left to one owner. In this setup cbp3 spreads `EVENTLOG_INDEXES` into its own index list.

## Browser

```ts
import { createClientReporter } from "@cb3/eventlog/client";

const clientLog = createClientReporter({ endpoint: "/api/logs", version });
clientLog.installGlobalHandlers({ getRoute: async () => (await import("$app/state")).page.route.id });
clientLog.error(err, { code: "upload.failed", status: 503, data: { size } });
```

A browser may send uncoded errors. Warnings, info and coded errors must use a code from the server's `clientCodes`, at the level declared there.

## SvelteKit

```ts
const eventlog = createSvelteKitEventlog<RequestEvent>(log, {
  authorize: (event) => requireSuperadmin(event.locals.user),
  getUser: (event) => event.locals.user && { id: event.locals.user.auth, role: event.locals.user.role },
});

// hooks.server.ts
export const handleError = eventlog.handleError;
// inside handle, after resolve: eventlog.recordServerErrorResponse(event, response)

// api/logs/+server.ts
export const { POST, GET } = eventlog.routes.logs;
// api/logs/[id]/+server.ts
export const { GET, PATCH } = eventlog.routes.group;
// api/logs/events/[eventId]/+server.ts
export const { GET } = eventlog.routes.event;
```

## Release

Bump `version` in package.json, commit, then run `npm run release` (it refuses to run with uncommitted changes, then tests, builds and tags).
