// GLITCHY (gl11tchy): fork-owned orchestration layer — unit tests for fleet/spawn presentation logic
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ReviewDiffPreviewSource,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "../../types";
import type { SidebarThreadSummary } from "../../types";
import type { SpawnWorktreeAgentsResult } from "./spawnWorktreeAgents.logic";
import {
  describeSpawnOutcome,
  filterWorktreeThreads,
  getDiffReviewSectionIdentity,
  isWorktreeThread,
  MAX_SPAWN_COUNT,
  MIN_SPAWN_COUNT,
  selectVisibleDiffPreviewSources,
  stepSpawnCount,
  summarizeFleetStatuses,
} from "./orchestrator.logic";

const environmentId = EnvironmentId.make("environment-local");

function makeDiffSource(
  kind: ReviewDiffPreviewSource["kind"],
  diff: string,
): ReviewDiffPreviewSource {
  return {
    id: kind,
    kind,
    title: kind === "branch-range" ? "Against main" : "Dirty worktree",
    baseRef: kind === "branch-range" ? "main" : "HEAD",
    headRef: kind === "branch-range" ? "feature" : null,
    diff,
    diffHash: `${kind}-hash`,
    truncated: false,
  };
}

describe("selectVisibleDiffPreviewSources", () => {
  it("keeps both committed and uncommitted changes in PR-preview order", () => {
    const visible = selectVisibleDiffPreviewSources([
      makeDiffSource("working-tree", "working patch"),
      makeDiffSource("branch-range", "branch patch"),
    ]);

    expect(visible.map((source) => source.kind)).toEqual(["branch-range", "working-tree"]);
  });

  it("drops empty sources without hiding a non-empty source", () => {
    const visible = selectVisibleDiffPreviewSources([
      makeDiffSource("branch-range", "  "),
      makeDiffSource("working-tree", "working patch"),
    ]);

    expect(visible.map((source) => source.kind)).toEqual(["working-tree"]);
  });
});

describe("getDiffReviewSectionIdentity", () => {
  const threadId = ThreadId.make("thread-1");

  it("restores working-tree comments after changes are committed", () => {
    expect(getDiffReviewSectionIdentity(threadId, "branch-range", ["branch-range"])).toEqual({
      sectionId: "glitch-diff:thread-1:branch-range",
      restoreSectionIds: ["glitch-diff:thread-1", "glitch-diff:thread-1:working-tree"],
    });
  });

  it("keeps source comments separate while both diffs are visible", () => {
    expect(
      getDiffReviewSectionIdentity(threadId, "branch-range", ["branch-range", "working-tree"]),
    ).toEqual({
      sectionId: "glitch-diff:thread-1:branch-range",
      restoreSectionIds: [],
    });
    expect(
      getDiffReviewSectionIdentity(threadId, "working-tree", ["branch-range", "working-tree"]),
    ).toEqual({
      sectionId: "glitch-diff:thread-1:working-tree",
      restoreSectionIds: ["glitch-diff:thread-1"],
    });
  });
});

function makeShell(overrides: Partial<SidebarThreadSummary> = {}): SidebarThreadSummary {
  return {
    id: ThreadId.make("thread-1"),
    environmentId,
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.3-codex",
    },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-02-13T00:00:00.000Z",
    updatedAt: "2026-02-13T00:00:00.000Z",
    archivedAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...overrides,
  };
}

describe("isWorktreeThread", () => {
  it("is true only for active threads with a non-empty worktreePath", () => {
    expect(isWorktreeThread(makeShell({ worktreePath: "/tmp/wt" }))).toBe(true);
    expect(isWorktreeThread(makeShell({ worktreePath: null }))).toBe(false);
    expect(isWorktreeThread(makeShell({ worktreePath: "   " as unknown as string }))).toBe(false);
    expect(
      isWorktreeThread(
        makeShell({
          worktreePath: "/tmp/wt",
          archivedAt: "2026-03-01T00:00:00.000Z",
        }),
      ),
    ).toBe(false);
  });
});

describe("filterWorktreeThreads", () => {
  it("drops non-worktree and archived worktree threads", () => {
    const threads = [
      makeShell({ id: ThreadId.make("a"), worktreePath: "/tmp/a" }),
      makeShell({ id: ThreadId.make("b"), worktreePath: null }),
      makeShell({ id: ThreadId.make("c"), worktreePath: "/tmp/c" }),
      makeShell({
        id: ThreadId.make("archived"),
        worktreePath: "/tmp/archived",
        archivedAt: "2026-03-01T00:00:00.000Z",
      }),
    ];
    const result = filterWorktreeThreads(threads);
    // 'b' (no path) and 'archived' are dropped; 'a' and 'c' share updatedAt.
    expect(result.map((t) => t.id)).toEqual([ThreadId.make("a"), ThreadId.make("c")]);
  });

  it("sorts most-recently-updated first", () => {
    const threads = [
      makeShell({
        id: ThreadId.make("old"),
        worktreePath: "/tmp/old",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      makeShell({
        id: ThreadId.make("new"),
        worktreePath: "/tmp/new",
        updatedAt: "2026-03-01T00:00:00.000Z",
      }),
    ];
    expect(filterWorktreeThreads(threads).map((t) => t.id)).toEqual([
      ThreadId.make("new"),
      ThreadId.make("old"),
    ]);
  });

  it("returns a new array and does not mutate input", () => {
    const input = [makeShell({ worktreePath: "/tmp/a" })];
    const result = filterWorktreeThreads(input);
    expect(result).not.toBe(input);
  });
});

describe("summarizeFleetStatuses", () => {
  it("buckets labels into working / attention / completed / idle", () => {
    const counts = summarizeFleetStatuses([
      "Working",
      "Connecting",
      "Pending Approval",
      "Awaiting Input",
      "Plan Ready",
      "Completed",
      null,
    ]);
    expect(counts).toEqual({
      working: 2,
      attention: 3,
      completed: 1,
      idle: 1,
      total: 7,
    });
  });

  it("handles an empty fleet", () => {
    expect(summarizeFleetStatuses([])).toEqual({
      working: 0,
      attention: 0,
      completed: 0,
      idle: 0,
      total: 0,
    });
  });
});

describe("describeSpawnOutcome", () => {
  const result = (succeeded: number, failed: number): SpawnWorktreeAgentsResult => ({
    outcomes: [],
    succeeded,
    failed,
  });

  it("reports full success", () => {
    expect(describeSpawnOutcome(result(3, 0))).toEqual({
      tone: "success",
      headline: "Spawned 3 agents.",
    });
    expect(describeSpawnOutcome(result(1, 0)).headline).toBe("Spawned 1 agent.");
  });

  it("reports partial failure as partial (never silent)", () => {
    expect(describeSpawnOutcome(result(2, 1))).toEqual({
      tone: "partial",
      headline: "Spawned 2 agents, 1 failed.",
    });
  });

  it("reports total failure", () => {
    expect(describeSpawnOutcome(result(0, 4))).toEqual({
      tone: "error",
      headline: "All 4 agents failed.",
    });
    expect(describeSpawnOutcome(result(0, 0)).tone).toBe("error");
  });
});

describe("stepSpawnCount", () => {
  it("clamps to the [1, 8] range", () => {
    expect(stepSpawnCount(MIN_SPAWN_COUNT, -1)).toBe(MIN_SPAWN_COUNT);
    expect(stepSpawnCount(MAX_SPAWN_COUNT, 1)).toBe(MAX_SPAWN_COUNT);
    expect(stepSpawnCount(3, 2)).toBe(5);
    expect(stepSpawnCount(4, -1)).toBe(3);
  });
});
