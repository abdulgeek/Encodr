import { createJobSchema } from "@/lib/schemas";
import { error, json, withAuth } from "@/lib/server/http";
import { createJob, listJobs } from "@/lib/server/store";

// GET → the list of jobs (newest first). Auth required.
export async function GET(req: Request) {
  return withAuth(req, () => json(listJobs()));
}

// POST → validate { sourceUrl, title? } and create a job. Auth required.
export async function POST(req: Request) {
  return withAuth(req, async () => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return error(400, "Invalid JSON body");
    }

    const parsed = createJobSchema.safeParse(body);
    if (!parsed.success) {
      // Same 422 shape as login, so the client maps fieldErrors straight onto the form.
      return json(
        { detail: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        422,
      );
    }

    return json(createJob(parsed.data), 201);
  });
}
