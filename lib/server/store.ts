import { randomUUID } from "node:crypto";
import {
  type EncodeResult,
  type EncodeRun,
  type Job,
  type JobStatus,
  type Stage,
} from "@/lib/types";

// In-memory store. A single Node process in `next dev`, so module-level Maps are fine.
//
// The job/run CRUD below is provided. The interesting part — turning an in-flight run into a
// live stage + progress over ~20–40s — is left for you.

const jobs = new Map<string, Job>();
const runs = new Map<string, RunRecord>();

interface RunRecord {
  id: string;
  jobId: string;
  sourceUrl: string;
  startedAt: number; // epoch ms
}

/** The "magic" source URL that should always fail partway, so reviewers can see error handling. */
export const FAIL_URL = "https://cdn.example.com/videos/corrupt.mp4";

// --- run state machine (pure) -------------------------------------------------
//
// A run's state is a pure function of elapsed time = now - startedAt. No timers, no mutation: the
// same (record, now) always yields the same state, which is what makes it unit-testable. The SSE
// route is what samples this on a clock — computeRun itself never touches one.

/** Stage boundaries in seconds of elapsed time. Each stage runs until its `until` mark. */
const TIMELINE: { stage: Stage; until: number }[] = [
  { stage: "QUEUED", until: 2 },
  { stage: "DOWNLOADING", until: 8 },
  { stage: "PROBING", until: 12 },
  { stage: "TRANSCODING", until: 24 },
  { stage: "PACKAGING", until: 30 },
];

const TOTAL_SEC = 30; // whole timeline; progressPct spans 0–100 across all of it, not per stage
const FAIL_AT_SEC = 18; // the corrupt source dies here, mid-TRANSCODING

function stageAt(elapsedSec: number): Stage {
  for (const { stage, until } of TIMELINE) {
    if (elapsedSec < until) return stage;
  }
  return "PACKAGING"; // the tail of the timeline, just before COMPLETED
}

/** Overall progress across the whole timeline, floored so it never reads 100 before COMPLETED. */
function overallProgress(elapsedSec: number): number {
  return Math.floor((Math.min(elapsedSec, TOTAL_SEC) / TOTAL_SEC) * 100);
}

/** Deterministic, believable output — identical for every completed run (no randomness, stays pure). */
function completedResult(): EncodeResult {
  return {
    durationSec: 596,
    renditions: [
      { label: "1080p", width: 1920, height: 1080, sizeMb: 412.5 },
      { label: "720p", width: 1280, height: 720, sizeMb: 188.3 },
      { label: "480p", width: 854, height: 480, sizeMb: 96.7 },
    ],
    warnings: ["Variable frame rate detected in source; normalized to 30fps"],
  };
}

export function computeRun(record: RunRecord, now: number = Date.now()): EncodeRun {
  const elapsedSec = Math.max(0, (now - record.startedAt) / 1000);
  const base = { id: record.id, jobId: record.jobId };

  // The magic corrupt source aborts mid-transcode and freezes progress where it died.
  if (record.sourceUrl === FAIL_URL && elapsedSec >= FAIL_AT_SEC) {
    return {
      ...base,
      stage: "FAILED",
      progressPct: overallProgress(FAIL_AT_SEC),
      error: "Source file appears corrupt, transcode aborted",
    };
  }

  if (elapsedSec >= TOTAL_SEC) {
    return { ...base, stage: "COMPLETED", progressPct: 100, result: completedResult() };
  }

  return { ...base, stage: stageAt(elapsedSec), progressPct: overallProgress(elapsedSec) };
}

// --- job/run CRUD (provided) ---

// Status is never stored — it's derived from the latest run's computed state at read time. That's
// the "no impossible states" point: a job can't claim COMPLETED while its run is mid-transcode,
// because the two are the same source of truth.
function deriveJobStatus(job: Job, now: number): JobStatus {
  if (!job.latestRunId) return "NEW";
  const run = getRun(job.latestRunId, now);
  if (!run) return "NEW";
  if (run.stage === "COMPLETED") return "COMPLETED";
  if (run.stage === "FAILED") return "FAILED";
  return "RUNNING";
}

function withDerivedStatus(job: Job, now: number): Job {
  return { ...job, status: deriveJobStatus(job, now) };
}

export function listJobs(now: number = Date.now()): Job[] {
  return [...jobs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((job) => withDerivedStatus(job, now));
}

export function getJob(id: string, now: number = Date.now()): Job | null {
  const job = jobs.get(id);
  return job ? withDerivedStatus(job, now) : null;
}

export function createJob(input: { sourceUrl: string; title?: string }): Job {
  const id = `j_${randomUUID().slice(0, 8)}`;
  const sourceUrl = input.sourceUrl.trim();
  const job: Job = {
    id,
    title: input.title?.trim() || deriveTitle(sourceUrl),
    sourceUrl,
    status: "NEW",
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
}

function deriveTitle(sourceUrl: string): string {
  try {
    const path = new URL(sourceUrl).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "Untitled encode";
  } catch {
    return "Untitled encode";
  }
}

export function startRun(jobId: string): RunRecord | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  const record: RunRecord = {
    id: `r_${randomUUID().slice(0, 8)}`,
    jobId,
    sourceUrl: job.sourceUrl,
    startedAt: Date.now(),
  };
  runs.set(record.id, record);
  job.latestRunId = record.id;
  return record;
}

export function getRunRecord(id: string): RunRecord | null {
  return runs.get(id) ?? null;
}

export function getRun(id: string, now: number = Date.now()): EncodeRun | null {
  const record = runs.get(id);
  return record ? computeRun(record, now) : null;
}

export type { RunRecord };
