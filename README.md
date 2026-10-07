# @oppooskar/eventlog

Errors, warnings and info events, grouped by kind and stored in MongoDB (`logGroup`, `logEvent`). Used by cbp3, which also shows them in `/admin/logs`, and by media-worker. Both write to the same database.

## Install

Published to GitHub Packages. Consumers point the scope at the registry in their `.npmrc`:

```
@oppooskar:registry=https://npm.pkg.github.com
```

and install a version like any other dependency (`pnpm add @oppooskar/eventlog` / `npm install @oppooskar/eventlog`).

Installing needs a token with `read:packages`, even for your own packages:
- **Dev machine:** a classic personal access token in `~/.npmrc`: `//npm.pkg.github.com/:_authToken=ghp_...`
- **Docker builds:** a read-only token passed as the `npm_token` build secret (see the Dockerfile and docker-compose.yml in cbp3 and media-worker). It never ends up in an image layer.

## Developing against an app

To try unreleased changes inside an app, link the checkout and rebuild on change:

```sh
# in cb3-eventlog
npm run build -- --watch
# in cbp3 / media-worker
pnpm link ../cb3-eventlog   # or: npm link ../cb3-eventlog
```

Undo with `pnpm unlink @oppooskar/eventlog` / `npm install`. Don't commit the link — `package.json` keeps the version range.

## Server

```ts
import { createEventLog, EVENTLOG_INDEXES } from "@oppooskar/eventlog";

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

## Alerts

Pass `onAlert` to be told when an error needs attention, e.g. to post it to Slack with `@oppooskar/slack`:

```ts
const log = createEventLog({
  db, service: "cbp3",
  onAlert: (alert) => postToSlack(alert),   // { reason, group, event, sinceLastAlert }
  alertReminderHours: 24,                   // default; 0 = no reminders
});
```

It fires for errors only, and once per group for each of:
- `new` — the group's first occurrence;
- `reopened` — the first occurrence after the group was resolved;
- `reminder` — the group is still open and still happening, at most once per `alertReminderHours`. `sinceLastAlert` says how many occurrences there were since the previous alert.

Each alert is claimed with one atomic update on the group (`alertedAt`), so when several instances share the database exactly one of them calls `onAlert`. It is awaited as part of the write; a failure is printed to the console and never logged as an event (no loops). Groups that existed before alerts were turned on alert as `new` on their next occurrence.

## Browser

```ts
import { createClientReporter } from "@oppooskar/eventlog/client";

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

Bump `version` in package.json, commit, then run `npm run release`. It refuses to run with uncommitted changes, then tests, builds, tags and pushes. The pushed `v*` tag triggers `.github/workflows/publish.yml`, which publishes to GitHub Packages. Published versions are permanent — fix mistakes with a new version.
