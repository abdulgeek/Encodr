import { startRunSchema } from "@/lib/schemas";
import { error, json, withAuth } from "@/lib/server/http";
import { startRun } from "@/lib/server/store";

// POST → start an encode run for { jobId } and return { runId } (201). Auth required.
export async function POST(req: Request) {
  return withAuth(req, async () => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return error(400, "Invalid JSON body");
    }

    const parsed = startRunSchema.safeParse(body);
    if (!parsed.success) {
      return json(
        { detail: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        422,
      );
    }

    const record = startRun(parsed.data.jobId);
    if (!record) return error(404, "Job not found");

    return json({ runId: record.id }, 201);
  });
}
