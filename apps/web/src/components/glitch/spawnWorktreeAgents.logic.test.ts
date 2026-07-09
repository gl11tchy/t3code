// GLITCHY (gl11tchy): fork-owned orchestration layer — unit tests for spawn-plan pure logic
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { describe, expect, it } from "vite-plus/test";

import {
  buildSpawnPlan,
  clampSpawnCount,
  EMPTY_PROMPT_ERROR,
  formatUnknownError,
  makeUniformFailedOutcomes,
  MAX_SPAWN_COUNT,
  MIN_SPAWN_COUNT,
  summarizeOutcomes,
  type SpawnAgentOutcome,
} from "./spawnWorktreeAgents.logic";

const projectRef = scopeProjectRef(
  EnvironmentId.make("environment-local"),
  ProjectId.make("project-1"),
);

describe("clampSpawnCount", () => {
  it("clamps below the minimum to 1", () => {
    expect(clampSpawnCount(0)).toBe(MIN_SPAWN_COUNT);
    expect(clampSpawnCount(-3)).toBe(MIN_SPAWN_COUNT);
  });

  it("clamps above the maximum to 8", () => {
    expect(clampSpawnCount(9)).toBe(MAX_SPAWN_COUNT);
    expect(clampSpawnCount(100)).toBe(MAX_SPAWN_COUNT);
  });

  it("floors fractional values within range", () => {
    expect(clampSpawnCount(3.9)).toBe(3);
    expect(clampSpawnCount(1.1)).toBe(1);
  });

  it("falls back to 1 for non-finite values", () => {
    expect(clampSpawnCount(Number.NaN)).toBe(MIN_SPAWN_COUNT);
    expect(clampSpawnCount(Number.POSITIVE_INFINITY)).toBe(MIN_SPAWN_COUNT);
    expect(clampSpawnCount(Number.NEGATIVE_INFINITY)).toBe(MIN_SPAWN_COUNT);
  });

  it("preserves in-range integers", () => {
    expect(clampSpawnCount(1)).toBe(1);
    expect(clampSpawnCount(4)).toBe(4);
    expect(clampSpawnCount(8)).toBe(8);
  });
});

describe("buildSpawnPlan", () => {
  it("yields N descriptors for count N (clamped)", () => {
    const plan = buildSpawnPlan({ prompt: "fix the bug", count: 3 });
    expect(plan.count).toBe(3);
    expect(plan.agents).toHaveLength(3);
    expect(plan.agents.map((a) => a.index)).toEqual([0, 1, 2]);
    expect(plan.prompt).toBe("fix the bug");
    expect(plan.promptError).toBeUndefined();
  });

  it("clamps count when building the plan", () => {
    const high = buildSpawnPlan({ prompt: "hi", count: 99 });
    expect(high.count).toBe(MAX_SPAWN_COUNT);
    expect(high.agents).toHaveLength(MAX_SPAWN_COUNT);

    const low = buildSpawnPlan({ prompt: "hi", count: 0 });
    expect(low.count).toBe(MIN_SPAWN_COUNT);
    expect(low.agents).toHaveLength(MIN_SPAWN_COUNT);
  });

  it("rejects empty and whitespace-only prompts without dropping agents", () => {
    const empty = buildSpawnPlan({ prompt: "", count: 4 });
    expect(empty.promptError).toBe(EMPTY_PROMPT_ERROR);
    expect(empty.agents).toHaveLength(4);
    expect(empty.count).toBe(4);

    const whitespace = buildSpawnPlan({ prompt: "  \n\t  ", count: 2 });
    expect(whitespace.promptError).toBe(EMPTY_PROMPT_ERROR);
    expect(whitespace.agents).toHaveLength(2);
  });

  it("trims a valid prompt", () => {
    const plan = buildSpawnPlan({ prompt: "  ship it  ", count: 1 });
    expect(plan.prompt).toBe("ship it");
    expect(plan.promptError).toBeUndefined();
  });

  it("does not require projectRef for planning (hook resolves that later)", () => {
    // projectRef is only on the full input type; plan builder only needs prompt/count.
    void projectRef;
    const plan = buildSpawnPlan({ prompt: "ok", count: 1 });
    expect(plan.agents[0]?.index).toBe(0);
  });
});

describe("summarizeOutcomes", () => {
  it("counts succeeded and failed correctly", () => {
    const outcomes: SpawnAgentOutcome[] = [
      { index: 0, ok: true, threadId: "t-0" },
      { index: 1, ok: false, error: "boom" },
      { index: 2, ok: true, threadId: "t-2" },
      { index: 3, ok: false, error: "nope" },
    ];
    const summary = summarizeOutcomes(outcomes);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(2);
    expect(summary.outcomes).toBe(outcomes);
  });

  it("handles all success and all failure", () => {
    expect(
      summarizeOutcomes([
        { index: 0, ok: true, threadId: "a" },
        { index: 1, ok: true, threadId: "b" },
      ]),
    ).toMatchObject({ succeeded: 2, failed: 0 });

    expect(
      summarizeOutcomes([
        { index: 0, ok: false, error: "x" },
        { index: 1, ok: false, error: "y" },
      ]),
    ).toMatchObject({ succeeded: 0, failed: 2 });
  });

  it("handles an empty list", () => {
    expect(summarizeOutcomes([])).toEqual({ outcomes: [], succeeded: 0, failed: 0 });
  });
});

describe("makeUniformFailedOutcomes", () => {
  it("produces count failed outcomes with the same error", () => {
    const outcomes = makeUniformFailedOutcomes(3, "Could not resolve base branch.");
    expect(outcomes).toHaveLength(3);
    expect(outcomes.every((o) => !o.ok && o.error === "Could not resolve base branch.")).toBe(true);
    expect(outcomes.map((o) => o.index)).toEqual([0, 1, 2]);
  });
});

describe("formatUnknownError", () => {
  it("prefers Error.message and string values", () => {
    expect(formatUnknownError(new Error("real"), "fallback")).toBe("real");
    expect(formatUnknownError("stringy", "fallback")).toBe("stringy");
    expect(formatUnknownError({ weird: true }, "fallback")).toBe("fallback");
  });
});
