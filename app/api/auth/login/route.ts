import { error } from "@/lib/server/http";

// TODO(candidate): validate { email, password } (loginSchema), authenticate against the mock user,
// and return { accessToken, refreshToken, user } on success (401 otherwise).
export async function POST(_req: Request) {
  return error(501, "Not implemented: POST /api/auth/login");
}
