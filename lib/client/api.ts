import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "@/lib/client/token-store";

export class ApiError extends Error {
  status: number;
  /** Field-level errors from a 422, keyed by form field name. */
  fieldErrors?: Record<string, string[]>;
  constructor(status: number, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/** Fired when auth is unrecoverable. The auth provider listens for this and logs the user out. */
export const AUTH_LOGOUT_EVENT = "encodr:logout";

async function parseError(res: Response): Promise<ApiError> {
  let detail = res.statusText || "Request failed";
  let fieldErrors: Record<string, string[]> | undefined;
  try {
    const body = await res.json();
    if (body?.detail) detail = body.detail;
    if (body?.fieldErrors) {
      fieldErrors = body.fieldErrors;
      detail = "Validation failed";
    }
  } catch {
    /* non-JSON body */
  }
  return new ApiError(res.status, detail, fieldErrors);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/** Auth endpoints never trigger a silent refresh — a 401 there is a real failure (bad creds / bad refresh token). */
function isAuthPath(path: string): boolean {
  return path.startsWith("/api/auth/");
}

/** Fire the request with whatever access token is stored right now. Isolated so we can replay it verbatim after a refresh. */
function sendRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  const access = getAccessToken();
  if (access) headers["authorization"] = `Bearer ${access}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  return fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
}

/** Clear auth and signal the app (via the auth provider) to route back to sign-in. */
function forceLogout(): void {
  clearTokens();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
}

// One shared refresh: N concurrent 401s trigger a single /api/auth/refresh, not N (no refresh stampede).
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Swap the stored refresh token for a fresh access token, storing it on success and resolving true.
 * Concurrent callers share the one in-flight promise; it's reset in a finally so the next 401 wave
 * starts a new one. Deliberately a plain fetch (not request()) so a 401 from the refresh endpoint
 * can't recurse back into this same refresh-and-retry path. Exported so the SSE reconnect can reuse
 * the same shared refresh before reopening its stream.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  const p = (async (): Promise<boolean> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as { accessToken?: unknown };
    if (typeof data.accessToken !== "string") return false;

    setTokens({ accessToken: data.accessToken });
    return true;
  })().finally(() => {
    if (refreshInFlight === p) refreshInFlight = null;
  });

  refreshInFlight = p;
  return p;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await sendRequest(path, options);

  // A 401 on any non-auth route means the access token is (most likely) expired: refresh once, replay once.
  if (res.status === 401 && !isAuthPath(path)) {
    if (!getRefreshToken()) {
      // Nothing to refresh with — the session is unrecoverable.
      forceLogout();
      throw await parseError(res);
    }

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      forceLogout();
      throw await parseError(res);
    }

    // Replay the original request exactly once, now carrying the fresh access token.
    res = await sendRequest(path, options);
    if (res.status === 401) {
      forceLogout();
      throw await parseError(res);
    }
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
};
