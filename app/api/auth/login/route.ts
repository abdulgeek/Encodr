import { authenticate, issueTokens } from "@/lib/server/auth";
import { loginSchema } from "@/lib/schemas";
import { error, json } from "@/lib/server/http";

// Validate { email, password }, authenticate against the mock user, and hand back the token pair.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    // 422 with per-field errors, in the shape the client wrapper maps back onto the form.
    return json(
      { detail: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      422,
    );
  }

  const { email, password } = parsed.data;
  const user = authenticate(email, password);
  // Generic message on purpose — don't reveal whether the email or the password was wrong.
  if (!user) return error(401, "Invalid email or password");

  const { accessToken, refreshToken } = issueTokens(user.id);
  return json({ accessToken, refreshToken, user });
}
