import { issueAccessToken, verifyRefreshToken } from "@/lib/server/auth";
import { error, json } from "@/lib/server/http";

// Exchange a valid refresh token (from the body) for a fresh access token.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const refreshToken =
    typeof body === "object" && body !== null
      ? (body as { refreshToken?: unknown }).refreshToken
      : undefined;
  if (typeof refreshToken !== "string") return error(401, "Invalid refresh token");

  const userId = verifyRefreshToken(refreshToken);
  if (!userId) return error(401, "Invalid refresh token");

  return json({ accessToken: issueAccessToken(userId) });
}
