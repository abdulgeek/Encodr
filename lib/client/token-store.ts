// Single source of truth for auth tokens on the client.
// Kept outside React so the bare `apiFetch` wrapper and the auth context can share it without
// a circular import, and so concurrent requests read the same token.

const ACCESS_KEY = "encodr.accessToken";
const REFRESH_KEY = "encodr.refreshToken";
const USER_KEY = "encodr.user";

let accessToken: string | null = null;
let refreshToken: string | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

/** Hydrate the in-memory cache from localStorage (call once on the client at startup). */
export function hydrateTokens() {
  if (!isBrowser()) return;
  accessToken = window.localStorage.getItem(ACCESS_KEY);
  refreshToken = window.localStorage.getItem(REFRESH_KEY);
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function setTokens(tokens: { accessToken: string; refreshToken?: string }) {
  accessToken = tokens.accessToken;
  if (isBrowser()) window.localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    refreshToken = tokens.refreshToken;
    if (isBrowser()) window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  }
}

export function setStoredUser(user: unknown) {
  if (isBrowser()) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser<T>(): T | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  if (isBrowser()) {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
  }
}
