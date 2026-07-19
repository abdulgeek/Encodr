import { describe, expect, it } from "vitest";
import { computeRun, FAIL_URL, type RunRecord } from "@/lib/server/store";

// computeRun is a PURE function of elapsed time, so every test passes an explicit `now` — no clock,
// no timers, fully deterministic. START is an arbitrary fixed epoch; `at(rec, sec)` samples the run
// `sec` seconds into the timeline.
const START = 1_700_000_000_000;

function record(sourceUrl = "https://cdn.example.com/videos/clip.mp4"): RunRecord {
  return { id: "r_test", jobId: "j_test", sourceUrl, startedAt: START };
}

function at(rec: RunRecord, sec: number) {
  return computeRun(rec, START + sec * 1000);
}

describe("computeRun — normal run", () => {
  const rec = record();

  it("walks one stage per boundary", () => {
    expect(at(rec, 0).stage).toBe("QUEUED");
    expect(at(rec, 1.9).stage).toBe("QUEUED");
    expect(at(rec, 2).stage).toBe("DOWNLOADING");
    expect(at(rec, 7.9).stage).toBe("DOWNLOADING");
    expect(at(rec, 8).stage).toBe("PROBING");
    expect(at(rec, 12).stage).toBe("TRANSCODING");
    expect(at(rec, 24).stage).toBe("PACKAGING");
    expect(at(rec, 29.9).stage).toBe("PACKAGING");
  });

  it("reports overall progress across the whole timeline", () => {
    expect(at(rec, 0).progressPct).toBe(0);
    expect(at(rec, 12).progressPct).toBe(40);
    expect(at(rec, 24).progressPct).toBe(80);
  });

  it("never reports 100% before COMPLETED", () => {
    for (const sec of [0, 1, 8, 12, 23, 29, 29.99]) {
      const run = at(rec, sec);
      expect(run.stage).not.toBe("COMPLETED");
      expect(run.progressPct).toBeLessThan(100);
    }
  });

  it("completes at 30s with the result attached and 100%", () => {
    const run = at(rec, 30);
    expect(run.stage).toBe("COMPLETED");
    expect(run.progressPct).toBe(100);
    expect(run.error).toBeUndefined();
    expect(run.result?.durationSec).toBeGreaterThan(0);
    expect(run.result?.renditions.length).toBeGreaterThan(0);
  });

  it("stays COMPLETED after the timeline ends", () => {
    expect(at(rec, 45).stage).toBe("COMPLETED");
    expect(at(rec, 45).progressPct).toBe(100);
  });
});

describe("computeRun — corrupt source", () => {
  const rec = record(FAIL_URL);

  it("behaves like a normal run before the failure point", () => {
    const run = at(rec, 12);
    expect(run.stage).toBe("TRANSCODING");
    expect(run.progressPct).toBe(40);
    expect(run.error).toBeUndefined();
    expect(at(rec, 17.9).stage).toBe("TRANSCODING");
  });

  it("fails at 18s, frozen at 60% with an error and no result", () => {
    const run = at(rec, 18);
    expect(run.stage).toBe("FAILED");
    expect(run.progressPct).toBe(60);
    expect(run.error).toMatch(/corrupt/i);
    expect(run.result).toBeUndefined();
  });

  it("stays frozen at 60% for the rest of time", () => {
    expect(at(rec, 25).stage).toBe("FAILED");
    expect(at(rec, 25).progressPct).toBe(60);
    expect(at(rec, 300).progressPct).toBe(60);
  });
});
