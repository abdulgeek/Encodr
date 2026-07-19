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

/** Create a job, then invalidate the list so it refetches with the new row. */
export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobInput) => api.post<Job>("/api/jobs", input),
    onSuccess: () => {
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
