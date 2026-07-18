import { error } from "@/lib/server/http";

// TODO(candidate): auth-guarded — return the current EncodeRun by id (404 if missing).
export async function GET(_req: Request, _ctx: { params: Promise<{ id: string }> }) {
  return error(501, "Not implemented: GET /api/runs/[id]");
}
