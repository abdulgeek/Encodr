import { error } from "@/lib/server/http";

// TODO(candidate): exchange a valid refresh token (from the body) for a new access token.
export async function POST(_req: Request) {
  return error(501, "Not implemented: POST /api/auth/refresh");
}
