"use client";

import { useEffect, useState } from "react";
import type { Stage } from "@/lib/types";

export interface RunStreamState {
  stage: Stage | null;
  progressPct: number;
  log: string[];
  error: string | null;
  connected: boolean;
  done: boolean;
}

const initialState: RunStreamState = {
  stage: null,
  progressPct: 0,
  log: [],
  error: null,
  connected: false,
  done: false,
};

/**
 * TODO(candidate): subscribe to /api/runs/:id/events (SSE) and track live progress.
 *
 * Requirements:
 *  - update stage / progressPct / log as events arrive,
 *  - set done=true on a terminal stage and call onTerminal() (so the caller can refetch),
 *  - TEAR DOWN the connection on unmount and whenever runId changes — no leaked streams,
 *    no state updates after the component unmounts,
 *  - surface a failed run's error.
 *
 * Hint: native EventSource can't send an Authorization header. `@microsoft/fetch-event-source`
 * (already a dependency) lets you set headers and abort via an AbortController.
 */
export function useRunStream(runId: string | null, _onTerminal?: () => void): RunStreamState {
  const [state] = useState<RunStreamState>(initialState);

  useEffect(() => {
    if (!runId) return;
    // TODO(candidate): open the stream here and return a cleanup function.
  }, [runId]);

  return state;
}
