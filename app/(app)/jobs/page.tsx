"use client";

import Link from "next/link";
import { useJobs } from "@/lib/client/hooks";
import { StatusBadge } from "@/components/status-badge";

// Starting point: this renders the job list once GET /api/jobs works.
//
// TODO(candidate):
//  - Build the "create job" form (React Hook Form + createJobSchema). Validate the source URL,
//    show inline field errors, map server-side (422) errors back onto the right fields, and make
//    the new job appear without a full reload (invalidate the jobs query).
//  - Wire each list row to its detail page at /jobs/[id].
export default function JobsPage() {
  const jobs = useJobs();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">New encode job</h1>
        <p className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
          TODO(candidate): create-job form goes here (source URL + optional title, Zod-validated).
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Jobs</h2>
        {jobs.isLoading && <p className="text-sm text-neutral-500">Loading jobs…</p>}
        {jobs.isError && (
          <div className="text-sm text-red-600">
            Couldn’t load jobs (is GET /api/jobs implemented?).{" "}
            <button onClick={() => jobs.refetch()} className="underline">
              Retry
            </button>
          </div>
        )}
        {jobs.data?.length === 0 && (
          <p className="text-sm text-neutral-500">No jobs yet.</p>
        )}
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {jobs.data?.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{job.title}</p>
                  <p className="truncate text-xs text-neutral-500">{job.sourceUrl}</p>
                </div>
                <StatusBadge value={job.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
