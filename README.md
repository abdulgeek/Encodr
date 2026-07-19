# Encodr — Fullstack Take-Home

Thanks for taking the time! This is a small **media transcoding dashboard**. You'll build a flow where
a signed-in user creates an encode **job** from a media URL, starts a **transcode run**, watches its
**progress stream in live**, and sees the **output renditions** when it finishes.

The full brief — requirements, the API contract, and what we look for — is in **`BRIEF.md`** in this
repo. Read it first; this README only covers running the scaffold.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run test:run   # tests (one example test is included and passes)
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

Requires **Node 20+**. **Demo login:** `demo@encodr.dev` / `password123`.

On a fresh checkout the app runs but most features are stubbed — the API routes return `501` and the
client logic is unimplemented. That's expected: your job is to fill in the `TODO(candidate)` markers.

## What's provided vs. what you build

**Provided (so you don't fight setup):**
- Next.js (App Router) + TypeScript (strict) + Tailwind, configured and running.
- TanStack Query, React Hook Form + Zod, `@microsoft/fetch-event-source` installed.
- The **API contract** as shared types (`lib/types.ts`) and the schema file (`lib/schemas.ts`).
- The app shell + auth-aware layout, a working sign-in page, token storage plumbing
  (`lib/client/token-store.ts`), HTTP helpers (`lib/server/http.ts`), and a couple of UI components.
- Worked examples of the React Query pattern (`useJobs`, `useJob`).

**You implement (look for `TODO(candidate)`):**
- `lib/server/auth.ts` — issue/verify tokens (short-lived access + refresh).
- `app/api/**` — the Route Handlers (auth, jobs, runs, and the **SSE** progress stream).
- `lib/server/store.ts` — `computeRun()`: the encode run's stage/progress state machine.
- `lib/client/api.ts` — 401 → silent refresh + single retry.
- `lib/client/auth-context.tsx` — `login()`.
- `lib/client/use-run-stream.ts` — the SSE subscription hook (with cleanup).
- `lib/client/hooks.ts` — create-job / start-run mutations.
- `lib/schemas.ts` — real source-URL validation.
- The **job list + create form** and the **job detail** screen (run controls, live progress, results).

Use `https://cdn.example.com/videos/corrupt.mp4` as a source URL — your run state machine should make
that one **fail** partway, so you can build (and we can see) the error/retry path.

## Notes & ground rules

- State can live **in-memory** (a module-level `Map`) — no database needed. Restarting the dev server
  wiping data is fine.
- Keep the access-token TTL short (~60s) so your refresh path is actually exercised.
- AI tools are allowed, but you own every line — there's a follow-up interview where you'll explain and
  extend your own code.
- If something's ambiguous, make a reasonable call, note it here, and move on.

## Design decisions

Short notes on the calls I made and why.

**Tokens (hand-rolled, JWT-style).** I sign tokens with Node `crypto` — `base64url(payload).base64url(hmacSha256(payload))`, payload `{ sub, typ, exp }` — instead of pulling in a JWT library, to keep dependencies lean for a mock auth layer. The signing secret is `randomBytes` at module load, so a server restart logs everyone out; that's intentional and matches the in-memory state (nothing survives a restart, so sessions shouldn't either). A `typ` claim (`access` / `refresh`) is checked on every verify, so a refresh token can't be replayed as an access token, or vice-versa. Signatures are compared with `timingSafeEqual`. Wrong credentials get a generic `401` ("Invalid email or password") — same response whether or not the email exists, so there's no user enumeration.

**Refresh / retry (client).** On a `401` for a non-auth path, the request wrapper does exactly **one** silent refresh and then **one** replay of the original request; if that still fails, it clears tokens and dispatches a logout event that routes back to `/signin`. `/api/auth/*` paths are excluded — a failed login is a real failure, not an expired token, so it shouldn't trigger a refresh. Concurrent `401`s **share a single in-flight refresh** (a module-level promise, reset in a `finally`) so N simultaneous failures cause one refresh, not N — no refresh stampede.

**URL validation.** The source URL must parse as a URL, be `http`/`https`, and carry a real path (a bare host like `https://cdn.com` is rejected). I deliberately **don't require a file extension** — real media URLs are often extensionless (signed/CDN URLs, `/master`), so requiring one would reject valid input. The same Zod schema runs on client and server, and server-side field errors map back onto the exact form fields.

**Run engine.** A run's state is a **pure function of elapsed time** (`now - startedAt`) — no timers, no stored progress. The SSE route just samples that function once a second. Keeping it pure (and taking an explicit `now`) makes it trivially unit-testable with a fake clock. A job's status (`NEW`/`RUNNING`/`COMPLETED`/`FAILED`) is **derived from its latest run's computed state at read time, never written** — so impossible states (a `COMPLETED` job whose run is mid-transcode) simply can't exist.

**SSE authentication.** The stream uses the **same bearer header** as every other route, sent via `@microsoft/fetch-event-source` (native `EventSource` can't set headers). I rejected the alternatives: a **query-param token** leaks into server logs, browser history, and `Referer` headers; a **cookie** would split auth into two mechanisms (bearer for the API, cookie for the stream) and invite CSRF questions. One bearer path everywhere is simpler and safer. *Known limitation:* the token is checked once, at stream open — an already-open stream keeps working even past token expiry, but **reconnecting** after expiry currently needs a page reload. Fixing that (reconnect with a freshly-minted token) is the first item below.

## Testing

Strategy: a few **meaningful** tests over many shallow ones, aimed where the logic is trickiest rather than at trivial getters. Run with `npm run test:run`.

- `__tests__/compute-run.test.ts` — the pure run state machine: a boundary per stage, completion at 30s with the result attached at 100%, the `corrupt.mp4` path behaving normally before 18s then failing frozen at 60% with an error, and the invariant that progress never reaches 100 before `COMPLETED`.
- `__tests__/auth.test.ts` — issue/verify roundtrip, `typ` enforced both ways, tampered/forged/garbage tokens rejected, and expiry via fake timers (valid at issue, dead after 61s while the refresh token survives).
- `__tests__/api-refresh.test.ts` — the important one: mocks `fetch` and drives the real client wrapper through `401 → refresh → replay` (three round-trips, replay carries the new token), two concurrent `401`s collapsing to a **single** refresh (the stampede test), and a failed refresh clearing tokens + firing the logout event.