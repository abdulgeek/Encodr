import { error } from "@/lib/server/http";

// TODO(candidate): auth-guarded — return the job by id (404 if missing).
// Note: in Next 15+, `params` is a Promise — `const { id } = await params`.
export async function GET(_req: Request, _ctx: { params: Promise<{ id: string }> }) {
  return error(501, "Not implemented: GET /api/jobs/[id]");
}
