import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, AUTH_LOGOUT_EVENT } from "@/lib/client/api";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "@/lib/client/token-store";

// The trickiest client logic: on a 401, one silent refresh + one replay, concurrent 401s collapse to
// a single refresh, and a dead refresh clears auth. We stub global fetch and drive the real wrapper.

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  clearTokens();
  setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearTokens();
});

describe("client 401 handling", () => {
  it("refreshes once, replays the original request with the new token, and resolves with the data", async () => {
    let jobsCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) return jsonResponse({ accessToken: "access-2" }, 200);
      if (url.includes("/api/jobs")) {
        jobsCalls += 1;
        return jobsCalls === 1
          ? jsonResponse({ detail: "Not authenticated" }, 401)
          : jsonResponse({ items: [1, 2, 3] }, 200);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const data = await api.get<{ items: number[] }>("/api/jobs");

    expect(data).toEqual({ items: [1, 2, 3] });
    // Exactly three round-trips: original 401 → refresh → replay.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/jobs");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/auth/refresh");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/api/jobs");
    // The replay carried the refreshed token, and it's now the stored one.
    const replayInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect((replayInit.headers as Record<string, string>).authorization).toBe("Bearer access-2");
    expect(getAccessToken()).toBe("access-2");
  });

  it("does NOT refresh for auth paths — a failed login stays failed", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ detail: "Invalid email or password" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.post("/api/auth/login", { email: "x@y.z", password: "nope" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no refresh attempt
  });

  it("shares ONE refresh across concurrent 401s (no stampede)", async () => {
    let jobsCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) {
        refreshCalls += 1;
        return jsonResponse({ accessToken: "access-2" }, 200);
      }
      jobsCalls += 1; // first two are the concurrent originals (401), the rest are replays (200)
      return jobsCalls <= 2 ? jsonResponse({ detail: "nope" }, 401) : jsonResponse({ ok: true }, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([api.get("/api/jobs"), api.get("/api/jobs")]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(refreshCalls).toBe(1); // the whole point — not two
  });

  it("clears tokens and fires the logout event when the refresh itself fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/auth/refresh")) return jsonResponse({ detail: "bad refresh" }, 401);
      return jsonResponse({ detail: "Not authenticated" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onLogout = vi.fn();
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);

    await expect(api.get("/api/jobs")).rejects.toBeInstanceOf(ApiError);

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();

    window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
  });
});
