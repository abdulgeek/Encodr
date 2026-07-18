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

When you're done, please update this README with: anything you assumed, key design decisions
(especially how you authenticated the SSE stream and how the refresh/retry works), and what you'd do
next with more time.
# Encodr
