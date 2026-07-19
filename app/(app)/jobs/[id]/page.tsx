"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { jobKeys, runKeys, useJob, useRun, useStartRun } from "@/lib/client/hooks";
import { useRunStream } from "@/lib/client/use-run-stream";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
import type { EncodeRun, Job } from "@/lib/types";

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const jobQuery = useJob(id);

  if (jobQuery.isLoading) return <p className="text-sm text-neutral-500">Loading job…</p>;
  if (jobQuery.isError || !jobQuery.data) {
    return (
      <div className="text-sm text-red-600">
        Job not found.{" "}
        <Link href="/jobs" className="underline">
          Back to jobs
        </Link>
      </div>
    );
  }

  // Hand the loaded job to a child so run state can seed cleanly from job.latestRunId.
  return <JobDetail job={jobQuery.data} />;
}

function JobDetail({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const startRun = useStartRun();

  // Local run being watched — seeded from the job's latest run so opening a finished job replays
  // its terminal snapshot through the exact same stream path (no special-casing).
  const [runId, setRunId] = useState<string | null>(job.latestRunId ?? null);

  // On terminal, refetch the run (for its result) and the job/list so every status badge flips.
  const onTerminal = useCallback(() => {
    if (runId) queryClient.invalidateQueries({ queryKey: runKeys.detail(runId) });
    queryClient.invalidateQueries({ queryKey: jobKeys.detail(job.id) });
    queryClient.invalidateQueries({ queryKey: jobKeys.all });
  }, [queryClient, runId, job.id]);

  const stream = useRunStream(runId, onTerminal);
  const runQuery = useRun(runId);

  const start = () =>
    startRun.mutate(job.id, {
      onSuccess: (res) => {
        setRunId(res.runId);
        // Refetch job + list so the badge shows RUNNING right away, not the previous terminal status.
        queryClient.invalidateQueries({ queryKey: jobKeys.detail(job.id) });
        queryClient.invalidateQueries({ queryKey: jobKeys.all });
      },
    });

  const isFailed = stream.stage === "FAILED";
  const isCompleted = stream.stage === "COMPLETED";
  const startError =
    startRun.error instanceof Error ? startRun.error.message : startRun.isError ? "Couldn’t start run" : null;

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="text-sm text-neutral-500 hover:underline">
        ← All jobs
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{job.title}</h1>
          <p className="truncate text-sm text-neutral-500">{job.sourceUrl}</p>
        </div>
        <StatusBadge value={job.status} />
      </div>

      {/* No run yet → offer to start one. */}
      {!runId && (
        <div className="space-y-3 rounded-md border border-neutral-200 p-4">
          <p className="text-sm text-neutral-500">No runs yet for this job.</p>
          <button
            onClick={start}
            disabled={startRun.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {startRun.isPending ? "Starting…" : "Start encode"}
          </button>
          {startError && <p className="text-sm text-red-600">{startError}</p>}
        </div>
      )}

      {/* A run is being watched. */}
      {runId && (
        <section className="space-y-4">
          {stream.stage ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{stream.stage}</span>
                <span className="tabular-nums text-neutral-500">{stream.progressPct}%</span>
              </div>
              <ProgressBar value={stream.progressPct} failed={isFailed} />
            </div>
          ) : (
            !stream.error && <p className="text-sm text-neutral-500">Connecting to run…</p>
          )}

          {/* Failed run → prominent error + retry (starts a fresh run). */}
          {isFailed && (
            <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
              <p className="font-medium text-red-700">Encode failed</p>
              <p className="text-sm text-red-600">{stream.error ?? "The run failed."}</p>
              <button
                onClick={start}
                disabled={startRun.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {startRun.isPending ? "Starting…" : "Retry"}
              </button>
              {startError && <p className="text-sm text-red-600">{startError}</p>}
            </div>
          )}

          {/* Connection problem (not a run failure). */}
          {!isFailed && stream.error && (
            <p className="text-sm text-red-600">{stream.error}. Reload the page to reconnect.</p>
          )}

          {/* Completed → results from the refetched run. */}
          {isCompleted && <Results run={runQuery.data} loading={runQuery.isLoading} />}

          {/* Streaming log. */}
          {stream.log.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Log</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-neutral-900 p-3 font-mono text-xs leading-relaxed text-neutral-100">
                {stream.log.join("\n")}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Results({ run, loading }: { run: EncodeRun | undefined; loading: boolean }) {
  const result = run?.result;
  if (!result) {
    return <p className="text-sm text-neutral-500">{loading ? "Loading results…" : "No results."}</p>;
  }

  return (
    <div className="space-y-4 rounded-md border border-neutral-200 p-4">
      <p className="text-sm">
        Duration <span className="font-medium tabular-nums">{formatDuration(result.durationSec)}</span>
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <th className="pb-1 font-medium">Rendition</th>
            <th className="pb-1 font-medium">Resolution</th>
            <th className="pb-1 text-right font-medium">Size</th>
          </tr>
        </thead>
        <tbody>
          {result.renditions.map((r) => (
            <tr key={r.label} className="border-t border-neutral-100">
              <td className="py-1.5 font-medium">{r.label}</td>
              <td className="py-1.5 tabular-nums text-neutral-600">
                {r.width}×{r.height}
              </td>
              <td className="py-1.5 text-right tabular-nums text-neutral-600">{r.sizeMb} MB</td>
            </tr>
          ))}
        </tbody>
      </table>

      {result.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-600">
          {result.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
