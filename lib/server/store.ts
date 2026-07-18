import { randomUUID } from "node:crypto";
import { type EncodeRun, type Job } from "@/lib/types";

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

/**
 * TODO(candidate): compute a run's current state.
 *
 * Given a run record and a clock, derive { stage, progressPct, error?, result? }. Suggested approach:
 * model it as a pure function of elapsed time = (now - startedAt). Walk QUEUED → DOWNLOADING →
 * PROBING → TRANSCODING → PACKAGING over ~30s, then COMPLETED. If sourceUrl === FAIL_URL, end in
 * FAILED partway through. Keeping it pure (taking `now`) makes it easy to unit-test.
 */
export function computeRun(_record: RunRecord, _now: number = Date.now()): EncodeRun {
  throw new Error("Not implemented: computeRun");
}

// --- job/run CRUD (provided) ---

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null;
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
  // TODO(candidate): you'll probably also want the job's status in listJobs()/getJob() to reflect
  // its latest run (RUNNING / COMPLETED / FAILED). Decide where that derivation lives.
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
