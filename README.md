# Encodr

A small **media-transcoding dashboard** — my submission for the Encodr take-home. A signed-in user
creates an encode **job** from a media URL, starts a **run**, watches its progress stream **live** over
Server-Sent Events, and sees the output **renditions** on completion (or a clear error + **retry** on
failure).

Stack: Next.js (App Router) · TypeScript (strict) · TanStack Query · React Hook Form + Zod · SSE. State
is in-memory by design — no database. The original brief is in **`BRIEF.md`**.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run test:run   # unit tests — auth, the run state machine, and the client refresh/retry flow
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

Requires **Node 20+**. **Demo login:** `demo@encodr.dev` / `password123`.

Everything the brief asks for is implemented, plus a few of the optional stretch goals (see below). The
split below is what the scaffold provided vs. what I built.

## What's provided vs. what I built

**Provided (so you don't fight setup):**
- Next.js (App Router) + TypeScript (strict) + Tailwind, configured and running.
- TanStack Query, React Hook Form + Zod, `@microsoft/fetch-event-source` installed.
- The **API contract** as shared types (`lib/types.ts`) and the schema file (`lib/schemas.ts`).
- The app shell + auth-aware layout, a working sign-in page, token storage plumbing
  (`lib/client/token-store.ts`), HTTP helpers (`lib/server/http.ts`), and a couple of UI components.
- Worked examples of the React Query pattern (`useJobs`, `useJob`).

**Implemented (the former `TODO(candidate)` markers):**
- `lib/server/auth.ts` — issue/verify tokens (short-lived access + refresh).
- `app/api/**` — the Route Handlers (auth, jobs, runs, and the **SSE** progress stream).
- `lib/server/store.ts` — `computeRun()`: the encode run's stage/progress state machine.
- `lib/client/api.ts` — 401 → silent refresh + single retry.
- `lib/client/auth-context.tsx` — `login()`.
- `lib/client/use-run-stream.ts` — the SSE subscription hook (with cleanup).
- `lib/client/hooks.ts` — create-job / start-run mutations.
- `lib/schemas.ts` — real source-URL validation.
- The **job list + create form** and the **job detail** screen (run controls, live progress, results).

`https://cdn.example.com/videos/corrupt.mp4` is the source URL that **fails partway through**, so the
error and retry path is easy for a reviewer to see.

## Assumptions

- **State is in-memory** (module-level `Map`s). Restarting the dev server wipes jobs/runs and — because
  the signing secret is regenerated — logs everyone out. That's deliberate for a mock (see below).
- **Access-token TTL is 60s**, so the silent-refresh path is exercised in normal use rather than sitting
  dormant.
- A media source URL **need not have a file extension** — real CDN/signed URLs often don't.

## Design decisions

Short notes on the calls I made and why.

**Tokens (hand-rolled, JWT-style).** I sign tokens with Node `crypto` — `base64url(payload).base64url(hmacSha256(payload))`, payload `{ sub, typ, exp }` — instead of pulling in a JWT library, to keep dependencies lean for a mock auth layer. The signing secret is `randomBytes` at module load, so a server restart logs everyone out; that's intentional and matches the in-memory state (nothing survives a restart, so sessions shouldn't either). A `typ` claim (`access` / `refresh`) is checked on every verify, so a refresh token can't be replayed as an access token, or vice-versa. Signatures are compared with `timingSafeEqual`. Wrong credentials get a generic `401` ("Invalid email or password") — same response whether or not the email exists, so there's no user enumeration.

**Refresh / retry (client).** On a `401` for a non-auth path, the request wrapper does exactly **one** silent refresh and then **one** replay of the original request; if that still fails, it clears tokens and dispatches a logout event that routes back to `/signin`. `/api/auth/*` paths are excluded — a failed login is a real failure, not an expired token, so it shouldn't trigger a refresh. Concurrent `401`s **share a single in-flight refresh** (a module-level promise, reset in a `finally`) so N simultaneous failures cause one refresh, not N — no refresh stampede.

**URL validation.** The source URL must parse as a URL, be `http`/`https`, and carry a real path (a bare host like `https://cdn.com` is rejected). I deliberately **don't require a file extension** — real media URLs are often extensionless (signed/CDN URLs, `/master`), so requiring one would reject valid input. The same Zod schema runs on client and server, and server-side field errors map back onto the exact form fields.

**Run engine.** A run's state is a **pure function of elapsed time** (`now - startedAt`) — no timers, no stored progress. The SSE route just samples that function once a second. Keeping it pure (and taking an explicit `now`) makes it trivially unit-testable with a fake clock. A job's status (`NEW`/`RUNNING`/`COMPLETED`/`FAILED`) is **derived from its latest run's computed state at read time, never written** — so impossible states (a `COMPLETED` job whose run is mid-transcode) simply can't exist.

**SSE authentication + reconnect.** The stream uses the **same bearer header** as every other route, sent via `@microsoft/fetch-event-source` (native `EventSource` can't set headers). I rejected the alternatives: a **query-param token** leaks into server logs, browser history, and `Referer` headers; a **cookie** would split auth into two mechanisms (bearer for the API, cookie for the stream) and invite CSRF questions. If the stream drops or the token is expired at open, the hook **refreshes the access token and reopens with a fresh header** — up to 3 attempts a second apart, the counter resetting on a successful open, then surfacing a connection error. This is clean precisely because **every SSE event is a full snapshot, not a delta**: a reconnect just picks up the current state, so there's no need for `Last-Event-ID` or server-side replay.

## Testing

Strategy: a few **meaningful** tests over many shallow ones, aimed where the logic is trickiest rather than at trivial getters. Run with `npm run test:run`.

- `__tests__/compute-run.test.ts` — the pure run state machine: a boundary per stage, completion at 30s with the result attached at 100%, the `corrupt.mp4` path behaving normally before 18s then failing frozen at 60% with an error, and the invariant that progress never reaches 100 before `COMPLETED`.
- `__tests__/auth.test.ts` — issue/verify roundtrip, `typ` enforced both ways, tampered/forged/garbage tokens rejected, and expiry via fake timers (valid at issue, dead after 61s while the refresh token survives).
- `__tests__/api-refresh.test.ts` — the important one: mocks `fetch` and drives the real client wrapper through `401 → refresh → replay` (three round-trips, replay carries the new token), two concurrent `401`s collapsing to a **single** refresh (the stampede test), and a failed refresh clearing tokens + firing the logout event.

## Stretch goals

From the brief's optional list:
- ✅ **Concurrent 401s share one in-flight refresh** — a module-level promise, so N simultaneous 401s cause one refresh, not N.
- ✅ **SSE reconnect** after a transient drop or an expired token at open — refresh + reopen, up to 3 tries a second apart (see "SSE authentication + reconnect" above).
- ✅ **Optimistic job creation** — `onMutate` writes a temporary row (rendered non-clickable until the server assigns a real id), rolls back on error, and reconciles on settle.
- ⬜ A Playwright e2e — noted below.

## What I'd do next

- A **Playwright** happy-path e2e (sign in → create → run → completed, plus the corrupt-URL failure/retry).
- **Refresh-token rotation / revocation** — today a refresh token is valid for its full 7 days with no way to invalidate it.
- **Sync the refresh across browser tabs** (a `storage` event or `BroadcastChannel`) so one tab's refresh updates the others.
- **Persistence beyond the in-memory store** (a real database) so jobs, runs, and sessions survive a restart.