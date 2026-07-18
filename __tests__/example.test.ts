import { describe, expect, it } from "vitest";
import { ACTIVE_STAGES, isTerminalStage } from "@/lib/types";

// A trivial test so you can confirm the test harness works: `npm run test:run`.
// Delete or replace it — part of the exercise is writing your own meaningful tests.
describe("test harness", () => {
  it("runs", () => {
    expect(isTerminalStage("COMPLETED")).toBe(true);
    expect(isTerminalStage("QUEUED")).toBe(false);
    expect(ACTIVE_STAGES).toContain("TRANSCODING");
  });
});
