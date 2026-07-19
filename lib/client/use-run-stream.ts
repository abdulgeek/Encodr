"use client";

import { useEffect, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { refreshAccessToken } from "@/lib/client/api";
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

const MAX_RECONNECTS = 3;
const RECONNECT_DELAY_MS = 1000;

/** A cancellable delay — resolves early if the signal aborts, so teardown doesn't wait it out. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Subscribe to /api/runs/:id/events (SSE) and track live progress.
 *
 * The connection lives inside the effect and is torn down via its AbortController on unmount and on
 * every runId change — so there are no leaked streams and no state updates after unmount. onTerminal
 * is held in a ref so a changing callback identity never re-tears the stream; the effect depends only
 * on runId. Uses @microsoft/fetch-event-source (not native EventSource) so we can send the bearer
 * header and keep streaming while the tab is hidden.
 *
 * Reconnect: on a dropped stream or an expired token at open, we refresh the access token and reopen
 * with a fresh header — up to 3 attempts a second apart, the counter resetting on a successful open,
 * then surfacing a connection error. This is clean because every event is a *full snapshot*, not a
 * delta: a reconnect just picks up the current state, so no Last-Event-ID or server replay is needed.
 */
export function useRunStream(runId: string | null, onTerminal?: () => void): RunStreamState {
  const [state, setState] = useState<RunStreamState>(initialState);

  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;

  useEffect(() => {
    setState(initialState);
    if (!runId) return;

    const controller = new AbortController();
    let reconnects = 0;

    // One connection attempt. Resolves on a clean close (terminal reached, or we aborted); rejects on
    // a connection error (a non-ok open or a mid-stream drop) so the loop can decide whether to reopen.
    const openStream = () => {
      const token = getAccessToken();
      return fetchEventSource(`/api/runs/${runId}/events`, {
        signal: controller.signal,
        openWhenHidden: true, // a tab switch must not kill a live encode watch
        headers: token ? { authorization: `Bearer ${token}` } : {},
        async onopen(response) {
          if (response.ok) {
            reconnects = 0; // a good open resets the reconnect budget
            setState((s) => ({ ...s, connected: true, error: null }));
            return;
          }
          // e.g. a 401 from an expired token at open — throw so the loop refreshes and reopens.
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
          // stage actually changes — comparing against the *previous state's* stage — so 30 progress
          // ticks in TRANSCODING don't produce 30 identical lines. A failed frame adds its error line.
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
            controller.abort(); // clean close — resolves openStream, the loop then exits
          }
        },
        onerror(err) {
          throw err; // stop the library's own retry; WE drive reconnection (with a fresh token)
        },
      });
    };

    void (async () => {
      while (!controller.signal.aborted) {
        try {
          await openStream();
          return; // clean close: terminal reached or unmounted
        } catch {
          if (controller.signal.aborted) return;
          reconnects += 1;
          if (reconnects > MAX_RECONNECTS) {
            setState((s) => ({ ...s, connected: false, error: "Connection lost" }));
            return;
          }
          setState((s) => ({ ...s, connected: false }));
          await refreshAccessToken(); // mint a fresh access token before the next open
          await delay(RECONNECT_DELAY_MS, controller.signal);
        }
      }
    })();

    return () => controller.abort();
  }, [runId]);

  return state;
}
