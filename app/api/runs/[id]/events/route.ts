import { error, withAuth } from "@/lib/server/http";
import { computeRun, getRunRecord } from "@/lib/server/store";
import { isTerminalStage, type RunEvent, type Stage } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Human-readable line for each stage, streamed alongside the machine-readable stage/progress. */
function messageFor(stage: Stage): string {
  switch (stage) {
    case "QUEUED":
      return "Waiting in queue…";
    case "DOWNLOADING":
      return "Downloading source…";
    case "PROBING":
      return "Probing media…";
    case "TRANSCODING":
      return "Transcoding renditions…";
    case "PACKAGING":
      return "Packaging output…";
    case "COMPLETED":
      return "Encode complete";
    case "FAILED":
      return "Encode failed";
  }
}

/**
 * Live progress stream (SSE). Auth is the same bearer check as every other route — the client sends
 * the Authorization header via @microsoft/fetch-event-source, so getUserIdFromRequest just works.
 *
 * On open we push the current state immediately, then re-sample computeRun once a second, emitting a
 * `data: {json}` line each tick. When the run reaches a terminal stage we push that final event and
 * close. The interval is cleared on client disconnect (req.signal) and on stream cancel — no zombie
 * timers, no leaked streams.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuth(req, async () => {
    const { id } = await ctx.params;
    const record = getRunRecord(id);
    if (!record) return error(404, "Run not found");

    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const stopTimer = () => {
      if (interval !== undefined) {
        clearInterval(interval);
        interval = undefined;
      }
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const finish = () => {
          if (closed) return;
          closed = true;
          stopTimer();
          req.signal.removeEventListener("abort", onAbort);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        const onAbort = () => finish();

        // Sample the run and push one event. Ends the stream on a terminal stage or a dead controller.
        const tick = () => {
          if (closed) return;
          const run = computeRun(record);
          const event: RunEvent = {
            stage: run.stage,
            progressPct: run.progressPct,
            message: messageFor(run.stage),
            ...(run.error ? { error: run.error } : {}),
          };
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            finish(); // consumer went away between ticks
            return;
          }
          if (isTerminalStage(run.stage)) finish();
        };

        // Client already gone before we started.
        if (req.signal.aborted) {
          finish();
          return;
        }
        req.signal.addEventListener("abort", onAbort);

        tick(); // immediate snapshot on open
        if (!closed) interval = setInterval(tick, 1000);
      },
      cancel() {
        // The consumer cancelled the stream (e.g. navigated away) — stop sampling.
        closed = true;
        stopTimer();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no", // don't let a proxy buffer the stream
      },
    });
  });
}
