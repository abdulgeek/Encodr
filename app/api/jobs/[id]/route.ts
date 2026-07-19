import { error, json, withAuth } from "@/lib/server/http";
import { getJob } from "@/lib/server/store";

// GET → the job by id (404 if missing). Auth required.
// In Next 15+, `params` is a Promise — await it.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await ctx.params;
    const job = getJob(id);
    if (!job) return error(404, "Job not found");
    return json(job);
  });
}
