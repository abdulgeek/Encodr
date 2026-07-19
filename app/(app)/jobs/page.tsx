"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createJobSchema, type CreateJobInput } from "@/lib/schemas";
import { ApiError } from "@/lib/client/api";
import { useCreateJob, useJobs } from "@/lib/client/hooks";
import { StatusBadge } from "@/components/status-badge";

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function CreateJobForm() {
  const createJob = useCreateJob();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateJobInput>({
    resolver: zodResolver(createJobSchema),
    defaultValues: { sourceUrl: "", title: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createJob.mutateAsync(values);
      reset({ sourceUrl: "", title: "" });
    } catch (e) {
      // Map server-side (422) field errors onto the very same fields the client validator uses,
      // so a server rejection renders exactly where a client one would.
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, messages] of Object.entries(e.fieldErrors)) {
          const message = messages[0];
          if (message && (field === "sourceUrl" || field === "title")) {
            setError(field, { type: "server", message });
          }
        }
        return;
      }
      setError("root", {
        type: "server",
        message: e instanceof Error ? e.message : "Couldn’t create job",
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label className="mb-1 block text-sm font-medium">Source URL</label>
        <input
          {...register("sourceUrl")}
          type="url"
          placeholder="https://cdn.example.com/videos/clip.mp4"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {errors.sourceUrl && (
          <p className="mt-1 text-xs text-red-600">{errors.sourceUrl.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Title <span className="font-normal text-neutral-400">(optional)</span>
        </label>
        <input
          {...register("title")}
          type="text"
          placeholder="My clip"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
      </div>

      {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? "Creating…" : "Create job"}
      </button>
    </form>
  );
}

export default function JobsPage() {
  const jobs = useJobs();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-4 text-xl font-semibold">New encode job</h1>
        <CreateJobForm />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Jobs</h2>

        {jobs.isLoading && <p className="text-sm text-neutral-500">Loading jobs…</p>}

        {jobs.isError && (
          <div className="text-sm text-red-600">
            Couldn’t load jobs.{" "}
            <button onClick={() => jobs.refetch()} className="underline">
              Retry
            </button>
          </div>
        )}

        {jobs.data && jobs.data.length === 0 && (
          <p className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            No jobs yet. Create one above to get started.
          </p>
        )}

        {jobs.data && jobs.data.length > 0 && (
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200">
            {jobs.data.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{job.title}</p>
                    <p className="truncate text-xs text-neutral-500">{job.sourceUrl}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge value={job.status} />
                    <span className="text-xs text-neutral-400">
                      {formatCreatedAt(job.createdAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
