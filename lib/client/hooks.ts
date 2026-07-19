"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import type { CreateJobInput } from "@/lib/schemas";
import type { EncodeRun, Job } from "@/lib/types";

export const jobKeys = {
  all: ["jobs"] as const,
  detail: (id: string) => ["jobs", id] as const,
};

export const runKeys = {
  detail: (id: string) => ["runs", id] as const,
};

// Two worked examples to show the intended React Query pattern:
export function useJobs() {
  return useQuery({
    queryKey: jobKeys.all,
    queryFn: ({ signal }) => api.get<Job[]>("/api/jobs", signal),
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: ({ signal }) => api.get<Job>(`/api/jobs/${id}`, signal),
  });
}

/** Prefix marking a not-yet-persisted job in the cache — the list keeps these rows non-clickable. */
export const TEMP_JOB_PREFIX = "tmp_";

/** Mirror the server's filename-fallback title so the optimistic row reads the same as the real one. */
function deriveTitleFromUrl(sourceUrl: string): string {
  try {
    const path = new URL(sourceUrl).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "Untitled encode";
  } catch {
    return "Untitled encode";
  }
}

/**
 * Create a job, optimistically. onMutate writes a temporary row into the cache so the list updates
 * instantly; onError rolls the snapshot back; onSettled invalidates so the real server row (with its
 * real id) replaces the temp one either way.
 */
export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobInput) => api.post<Job>("/api/jobs", input),
    onMutate: async (input: CreateJobInput) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.all });
      const previous = queryClient.getQueryData<Job[]>(jobKeys.all);
      const optimistic: Job = {
        id: `${TEMP_JOB_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
        title: input.title?.trim() || deriveTitleFromUrl(input.sourceUrl),
        sourceUrl: input.sourceUrl.trim(),
        status: "NEW",
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Job[]>(jobKeys.all, (old) => [optimistic, ...(old ?? [])]);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(jobKeys.all, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

/** Start a run for a job. Returns { runId }; the detail page swaps that into local state. */
export function useStartRun() {
  return useMutation({
    mutationFn: (jobId: string) => api.post<{ runId: string }>("/api/runs", { jobId }),
  });
}

/**
 * The run's current server state. Enabled only once there's a runId. The stream drives live UI;
 * this is how the *result* (renditions/duration/warnings) is read once the stream reports terminal —
 * onTerminal invalidates this key so it refetches the completed run.
 */
export function useRun(runId: string | null) {
  return useQuery({
    queryKey: runKeys.detail(runId ?? ""),
    queryFn: ({ signal }) => api.get<EncodeRun>(`/api/runs/${runId}`, signal),
    enabled: !!runId,
  });
}
