"use client";

import { useEffect, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { getAccessToken } from "@/lib/client/token-store";
import { isTerminalStage, type RunEvent, type Stage } from "@/lib/types";

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
 * Subscribe to /api/runs/:id/events (SSE) and track live progress.
 *
 * The connection lives inside the effect and is torn down via its AbortController on unmount and on
 * every runId change — so there are no leaked streams and no state updates after unmount. onTerminal
 * is held in a ref so a changing callback identity never re-tears the stream; the effect depends only
 * on runId. Uses @microsoft/fetch-event-source (not native EventSource) so we can send the bearer
 * header and keep streaming while the tab is hidden.
 */
export function useRunStream(runId: string | null, onTerminal?: () => void): RunStreamState {
  const [state, setState] = useState<RunStreamState>(initialState);

  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;

  useEffect(() => {
    setState(initialState);
    if (!runId) return;

    const controller = new AbortController();
    const token = getAccessToken();

    fetchEventSource(`/api/runs/${runId}/events`, {
      signal: controller.signal,
      openWhenHidden: true, // a tab switch must not kill a live encode watch
      headers: token ? { authorization: `Bearer ${token}` } : {},
      async onopen(response) {
        if (response.ok) {
          setState((s) => ({ ...s, connected: true, error: null }));
          return;
        }
        // 401/404/… — surface as an error rather than letting the library retry forever.
        setState((s) => ({ ...s, connected: false, error: `Stream failed to open (${response.status})` }));
        throw new Error(`Stream failed to open (${response.status})`);
      },
      onmessage(ev) {
        if (!ev.data) return;
        let data: RunEvent;
        try {
          data = JSON.parse(ev.data) as RunEvent;
        } catch {
          return; // ignore a malformed frame rather than tearing the stream down
        }

        // Pure updater (safe under StrictMode double-invoke): a log line is appended only when the
        // stage actually changes — comparing against the *previous state's* stage, not a mutable ref —
        // so 30 progress ticks in TRANSCODING don't produce 30 identical lines. A failed frame adds
        // its error line on top.
        setState((s) => {
          const stageChanged = data.stage !== s.stage;
          let log = s.log;
          if (stageChanged) log = [...log, `${data.stage} — ${data.message}`];
          if (data.error) log = [...log, `Error: ${data.error}`];
          const terminal = isTerminalStage(data.stage);
          return {
            ...s,
            stage: data.stage,
            progressPct: data.progressPct,
            error: data.error ?? s.error,
            log,
            done: terminal || s.done,
            connected: terminal ? false : s.connected,
          };
        });

        if (isTerminalStage(data.stage)) {
          onTerminalRef.current?.();
          controller.abort(); // close from our side once terminal — nothing more will come
        }
      },
      onerror(err) {
        // Stop retrying: keep the first, most specific message if onopen already set one.
        setState((s) => ({ ...s, connected: false, error: s.error ?? "Connection lost" }));
        throw err; // rethrow → fetch-event-source stops instead of reconnecting forever
      },
    }).catch(() => {
      // Rejects on abort (our teardown) or when onopen/onerror throw — state is already set, swallow.
    });

    return () => controller.abort();
  }, [runId]);

  return state;
}
