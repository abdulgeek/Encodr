import type { User } from "@/lib/types";

// Mock auth for the exercise — no real identity provider, no database.
//
// TODO(candidate): implement token issuance + verification.
//  - issueTokens(): mint a SHORT-LIVED access token (~60s, so the client's refresh path is
//    observable) and a longer-lived refresh token. A signed JWT or an opaque token you verify
//    server-side both work.
//  - verify the access token in getUserIdFromRequest(), and the refresh token in the refresh route.
//  - Remember: native EventSource can't send an Authorization header — decide how the SSE route
//    will authenticate (header via fetch-event-source? short-lived query token? cookie?).

// The one hard-coded user. Documented in the README.
const USERS: (User & { password: string })[] = [
  { id: "u_demo", email: "demo@encodr.dev", name: "Demo User", password: "password123" },
];

export function authenticate(email: string, password: string): User | null {
  const user = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.password !== password) return null;
  const { password: _pw, ...safe } = user;
  return safe;
}

export function findUser(id: string): User | null {
  const user = USERS.find((u) => u.id === id);
  if (!user) return null;
  const { password: _pw, ...safe } = user;
  return safe;
}

export function issueTokens(_userId: string): { accessToken: string; refreshToken: string } {
  // TODO(candidate): mint real tokens.
  throw new Error("Not implemented: issueTokens");
}

export function issueAccessToken(_userId: string): string {
  // TODO(candidate): mint a new short-lived access token from a valid refresh.
  throw new Error("Not implemented: issueAccessToken");
}

/** Return the authenticated userId from the request, or null. */
export function getUserIdFromRequest(_req: Request): string | null {
  // TODO(candidate): read + verify the bearer (or query) token and return its subject.
  return null;
}

/** Verify a refresh token and return its subject (userId), or null. */
export function verifyRefreshToken(_token: string): string | null {
  // TODO(candidate): verify signature + expiry + type.
  return null;
}
