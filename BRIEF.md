# Encodr — Fullstack Engineer Take-Home

**Level:** Mid (2–4 yrs) · **Time budget:** ~6–10 focused hours (please take up to 3 calendar days)
**Stack:** Next.js (App Router) + React + TypeScript, with the backend-for-frontend implemented in
Next.js Route Handlers (Node).

A **starter scaffold** is provided — it's already set up and running, with the parts you build marked
`TODO(candidate)`. See `README.md` for how to run it.

---

## 1. What you're building

**Encodr** is a small media-transcoding dashboard. A signed-in user:

1. creates an encode **job** from a media source URL,
2. starts a transcode **run**,
3. watches the run's **progress stream in live**, and
4. sees the **output renditions** when it completes (or a clear error if it fails).

It's a deliberately small slice of a real product, chosen so you can show how you handle auth, an API
boundary, real-time updates, a multi-step workflow, forms, and tests — without a huge surface area.

---

## 2. Required tech

| Area | Use |
|---|---|
| Framework | **Next.js (App Router)** — provided in the scaffold |
| Language | **TypeScript**, `strict: true` (no `any` escape hatches in your code) |
| Data fetching | **TanStack Query (React Query)** for server state |
| Forms | **React Hook Form + Zod** |
| Backend-for-frontend | **Next.js Route Handlers** (`app/api/.../route.ts`) — your "backend" |
| Real-time | **Server-Sent Events (SSE)** for live progress |
| Tests | **Vitest + React Testing Library** |

No real database or external auth provider is needed — keep state **in memory** in the Node process
(a module-level `Map` is fine). Design the API as if a real backend sat behind it.

---

## 3. Functional requirements

### 3.1 Auth (mocked, but realistic)
- `POST /api/auth/login` accepts `{ email, password }`, validates against the one hard-coded user, and
  returns a short-lived **access token** (~60s) and a longer-lived **refresh token**.
- `POST /api/auth/refresh` exchanges a valid refresh token for a new access token.
- All `/api/jobs*` and `/api/runs*` routes reject unauthenticated requests with **401**.
- On the client, the request wrapper should attach the access token and, **on a 401, attempt one
  silent refresh and retry the original request once**; if refresh fails, clear auth and send the user
  back to sign-in. (Think about what happens if several requests 401 at the same time.)
- Unauthenticated visitors to the dashboard are redirected to `/signin`.

### 3.2 Jobs
- **List** jobs (`GET /api/jobs`) and **create** a job (`POST /api/jobs`) from a source URL + optional
  title.
- Validate the source URL with **Zod on both client and server** (a syntactically valid http(s) media
  URL). Surface server-side validation errors back onto the correct form fields.
- A **job detail** route (`/jobs/[id]`) shows status and lets the user start/monitor a run.

### 3.3 Encode run + live progress (the core)
- `POST /api/runs` starts a run for a job and returns a `runId`. The run advances through these stages
  over ~20–40 seconds (simulate with time on the server):

  ```
  QUEUED → DOWNLOADING → PROBING → TRANSCODING → PACKAGING → COMPLETED
  ```

  Make a specific "magic" source URL — `https://cdn.example.com/videos/corrupt.mp4` — end in **FAILED**
  partway, so the error path is exercisable.
- `GET /api/runs/[id]/events` is an **SSE** endpoint streaming progress, e.g.
  `{ "stage": "TRANSCODING", "progressPct": 62, "message": "…" }`.
- The detail UI must: show live stage + percentage from the stream; show a streaming **log**; **clean
  up the connection** on unmount/navigation (no leaked streams); handle **FAILED** with a clear error
  and a **retry**; and reflect the terminal status back in the jobs list.

### 3.4 Results
On `COMPLETED`, show a simple results view derived from server data — e.g. duration + a table of output
renditions (label / resolution / size) and any warnings. Clarity over visual flourish.

---

## 4. API contract

Treat this as the contract a backend team handed you. You may extend it; don't break it.

```
POST   /api/auth/login          → { accessToken, refreshToken, user }
POST   /api/auth/refresh        → { accessToken }                  (body: { refreshToken })
GET    /api/jobs                → Job[]                            (auth required)
POST   /api/jobs                → Job                              (auth required; { sourceUrl, title? })
GET    /api/jobs/:id            → Job                              (auth required)
POST   /api/runs                → { runId }                        (auth required; { jobId })
GET    /api/runs/:id            → EncodeRun                        (auth required)
GET    /api/runs/:id/events     → text/event-stream (SSE)          (auth required)
```

The shared TypeScript types for `Job`, `EncodeRun`, `Stage`, etc. are in `lib/types.ts` in the scaffold.

> Note: native `EventSource` can't set an `Authorization` header. How you authenticate the SSE stream
> (a header via `@microsoft/fetch-event-source`, a short-lived query-param token, a cookie, …) is a
> design decision we'd like to see you make and justify.

---

## 5. Out of scope (don't spend time here)
Real auth providers / databases / Docker. Pixel-perfect design, theming, animations. Sign-up, password
reset, roles. WebSockets / message queues (SSE is enough). Deployment.

UI polish won't earn the points it would in real product work — invest in correctness, state handling,
and tests instead.

---

## 6. What we look for
- **Real-time & async correctness** — the stream drives the UI, connections are cleaned up, terminal
  states are handled, no leaks or zombie timers.
- **Workflow modeling** — the run's stages modeled as an explicit, typed state machine; impossible
  states avoided.
- **Auth & API boundary** — the token-attach + silent-refresh + single-retry flow; clean handlers.
- **TypeScript & code quality** — strict types, a shared client/server contract, readable structure.
- **Forms & validation** — schema-driven, client+server aligned, server errors mapped to fields.
- **Testing** — a few *meaningful* tests over many trivial ones; tell us your strategy.

We do **not** expect every edge case or exhaustive tests at this level — a clean, working core beats a
sprawling, half-finished one.

### Optional stretch (only if the core is solid — note these in your README)
- Make concurrent 401s share a single in-flight refresh (no "refresh stampede").
- Reconnect/resume the SSE stream after a transient disconnect.
- Optimistic UI on create with rollback on failure.
- A Playwright e2e covering the happy path.

---

## 7. Submitting
Send back a **git repository** (link or zip with `.git` history — we look at commit history) whose
**README** covers: how to run it and run tests, the login credentials, your key design decisions and
trade-offs (especially **how you authenticated the SSE stream** and **how the refresh/retry works**),
and what you'd do next with more time.

It must run with `npm install && npm run dev` on **Node 20+** with zero manual setup.

There is a **short follow-up interview** where we'll walk through your code together and ask you to
extend it a little — so work in a way you can explain and build on.

### Ground rules
- AI tools (Copilot, Claude, etc.) are **allowed** — but you own every line and should be able to
  explain and modify any of it live.
- Keep dependencies reasonable; don't pull in something that does the exercise for you.
- If a requirement is ambiguous, make a reasonable assumption, **document it**, and move on.

*Questions about the brief? Email [HIRING CONTACT].*
