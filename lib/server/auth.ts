import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { User } from "@/lib/types";

// Mock auth for the exercise — no real identity provider, no database.
//
// Tokens are hand-rolled, JWT-style: `base64url(payload).base64url(hmacSha256(payload))`.
// The payload carries { sub, typ, exp } — no external JWT dependency. Signing key is a random
// per-process secret, so a server restart invalidates every outstanding token. That's fine here:
// all state is in memory anyway, and the brief explicitly allows sessions dying on restart.

const SECRET = randomBytes(32);

const ACCESS_TTL_SEC = 60; // short, so the client's silent-refresh path is actually exercised
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

type TokenType = "access" | "refresh";

interface TokenPayload {
  sub: string; // userId
  typ: TokenType;
  exp: number; // expiry, epoch seconds
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** HMAC-SHA256 of the encoded payload, keyed by the process secret. */
function sign(payloadB64: string): Buffer {
  return createHmac("sha256", SECRET).update(payloadB64).digest();
}

function encodeToken(payload: TokenPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sigB64 = sign(payloadB64).toString("base64url");
  return `${payloadB64}.${sigB64}`;
}

function issueToken(userId: string, typ: TokenType, ttlSec: number): string {
  return encodeToken({ sub: userId, typ, exp: nowSec() + ttlSec });
}

function decodePayload(payloadB64: string): TokenPayload | null {
  try {
    const raw: unknown = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.sub !== "string" || !r.sub) return null;
    if (r.typ !== "access" && r.typ !== "refresh") return null;
    if (typeof r.exp !== "number") return null;
    return { sub: r.sub, typ: r.typ, exp: r.exp };
  } catch {
    return null;
  }
}

/**
 * Verify a token's signature, expiry, and type. Returns the subject (userId) if everything checks
 * out, else null. The signature is compared in constant time to avoid leaking it via timing.
 */
function verifyToken(token: string | null | undefined, expectedType: TokenType): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = sign(payloadB64);
  const providedSig = Buffer.from(sigB64, "base64url");
  // timingSafeEqual throws on a length mismatch, so guard first — a wrong length is already a miss.
  if (providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  // Signature is authentic → the payload is ours and safe to trust.
  const payload = decodePayload(payloadB64);
  if (!payload) return null;
  if (payload.typ !== expectedType) return null;
  if (payload.exp <= nowSec()) return null; // expired
  return payload.sub;
}

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

export function issueTokens(userId: string): { accessToken: string; refreshToken: string } {
  return {
    accessToken: issueToken(userId, "access", ACCESS_TTL_SEC),
    refreshToken: issueToken(userId, "refresh", REFRESH_TTL_SEC),
  };
}

/** Mint a fresh short-lived access token — used by the refresh route. */
export function issueAccessToken(userId: string): string {
  return issueToken(userId, "access", ACCESS_TTL_SEC);
}

/** Return the authenticated userId from the request's bearer token, or null. */
export function getUserIdFromRequest(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  return verifyToken(match[1], "access");
}

/** Verify a refresh token and return its subject (userId), or null. */
export function verifyRefreshToken(token: string): string | null {
  return verifyToken(token, "refresh");
}
