import { error } from "@/lib/server/http";

// TODO(candidate): both handlers must require authentication (see lib/server/http.ts → withAuth).
//   GET  → return the list of jobs.
//   POST → validate the body with createJobSchema; on success create a job and return it (201);
//          on validation failure return field-level errors so the client can map them to the form.
export async function GET(_req: Request) {
  return error(501, "Not implemented: GET /api/jobs");
}

export async function POST(_req: Request) {
  return error(501, "Not implemented: POST /api/jobs");
}
