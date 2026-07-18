export const dynamic = "force-dynamic";

/**
 * TODO(candidate): the live progress stream — the core of this exercise.
 *
 * Return a Server-Sent Events stream (Content-Type: text/event-stream) that pushes the run's
 * progress as it advances, e.g.  data: {"stage":"TRANSCODING","progressPct":62,"message":"…"}\n\n
 * Close the stream once the run reaches a terminal stage (COMPLETED / FAILED), and clean up your
 * timer if the client disconnects (`req.signal`).
 *
 * Auth: native EventSource can't set an Authorization header — decide how you'll authenticate this
 * endpoint and make it consistent with your client.
 */
export async function GET(_req: Request, _ctx: { params: Promise<{ id: string }> }) {
  return new Response("Not implemented: GET /api/runs/[id]/events", { status: 501 });
}
