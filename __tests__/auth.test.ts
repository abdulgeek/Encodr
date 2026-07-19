import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getUserIdFromRequest,
  issueAccessToken,
  issueTokens,
  verifyRefreshToken,
} from "@/lib/server/auth";

const USER = "u_demo";

/** A request carrying `Authorization: Bearer <token>`, the way getUserIdFromRequest reads it. */
function bearer(token: string): Request {
  return new Request("http://localhost/api/jobs", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("issue + verify roundtrip", () => {
  it("accepts a freshly issued access token as the request bearer", () => {
    const { accessToken } = issueTokens(USER);
    expect(getUserIdFromRequest(bearer(accessToken))).toBe(USER);
  });

  it("accepts a freshly issued refresh token", () => {
    const { refreshToken } = issueTokens(USER);
    expect(verifyRefreshToken(refreshToken)).toBe(USER);
  });

  it("issueAccessToken mints a usable access token", () => {
    expect(getUserIdFromRequest(bearer(issueAccessToken(USER)))).toBe(USER);
  });
});

describe("token type is enforced (typ claim)", () => {
  it("rejects a refresh token used where an access token is expected", () => {
    const { refreshToken } = issueTokens(USER);
    expect(getUserIdFromRequest(bearer(refreshToken))).toBeNull();
  });

  it("rejects an access token used as a refresh token", () => {
    const { accessToken } = issueTokens(USER);
    expect(verifyRefreshToken(accessToken)).toBeNull();
  });
});

describe("bad tokens are rejected", () => {
  it("rejects a tampered signature", () => {
    const { accessToken } = issueTokens(USER);
    const [payload, sig] = accessToken.split(".");
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(getUserIdFromRequest(bearer(`${payload}.${flipped}`))).toBeNull();
  });

  it("rejects a forged payload kept with someone else's signature", () => {
    const { accessToken } = issueTokens(USER);
    const [, sig] = accessToken.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "u_attacker", typ: "access", exp: 9_999_999_999 }),
    ).toString("base64url");
    expect(getUserIdFromRequest(bearer(`${forged}.${sig}`))).toBeNull();
  });

  it("rejects garbage strings", () => {
    expect(verifyRefreshToken("garbage")).toBeNull();
    expect(verifyRefreshToken("a.b.c")).toBeNull();
    expect(verifyRefreshToken("")).toBeNull();
    expect(getUserIdFromRequest(bearer("not-a-token"))).toBeNull();
  });

  it("rejects a request with no bearer header", () => {
    expect(getUserIdFromRequest(new Request("http://localhost/api/jobs"))).toBeNull();
  });
});

describe("expiry", () => {
  afterEach(() => vi.useRealTimers());

  it("access token is valid at issue and dead after 61s; refresh survives", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { accessToken, refreshToken } = issueTokens(USER);

    // Valid immediately.
    expect(getUserIdFromRequest(bearer(accessToken))).toBe(USER);

    // 61s later the 60s access token is dead, but the 7-day refresh token still verifies.
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    expect(getUserIdFromRequest(bearer(accessToken))).toBeNull();
    expect(verifyRefreshToken(refreshToken)).toBe(USER);
  });
});
