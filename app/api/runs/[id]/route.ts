import { error, json, withAuth } from "@/lib/server/http";
import { getRun } from "@/lib/server/store";

// GET → the current computed EncodeRun by id (404 if missing). Auth required.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await ctx.params;
    const run = getRun(id);
    if (!run) return error(404, "Run not found");
    return json(run);
  });
}
