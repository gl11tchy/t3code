// GLITCHY (gl11tchy): fork-owned orchestration layer — unit tests for spawn-plan pure logic
import {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import {
  buildSpawnPlan,
  clampSpawnCount,
  EMPTY_PROMPT_ERROR,
  formatUnknownError,
  isModelSelectionUsableInEnvironment,
  makeUniformFailedOutcomes,
  MAX_SPAWN_COUNT,
  MIN_SPAWN_COUNT,
  resolveSpawnModelForEntry,
  resolveSpawnModelSelection,
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

function provider(input: {
  provider: ProviderDriverKind;
  instanceId: string;
  enabled?: boolean;
  availability?: ServerProvider["availability"];
  status?: ServerProvider["status"];
  models?: ReadonlyArray<{ slug: string; isCustom?: boolean }>;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: input.provider,
    enabled: input.enabled ?? true,
    installed: true,
    version: null,
    status: input.status ?? "ready",
    ...(input.availability ? { availability: input.availability } : {}),
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: (input.models ?? [{ slug: "gpt-5.4" }]).map((model) => ({
      slug: model.slug,
      name: model.slug,
      isCustom: model.isCustom ?? false,
      capabilities: {},
    })),
    slashCommands: [],
    skills: [],
  };
}

const codex = ProviderDriverKind.make("codex");
const claude = ProviderDriverKind.make("claudeAgent");

describe("isModelSelectionUsableInEnvironment / resolveSpawnModelSelection", () => {
  const entries = deriveProviderInstanceEntries([
    provider({
      provider: codex,
      instanceId: "codex",
      models: [{ slug: "gpt-5.4" }],
    }),
    provider({
      provider: claude,
      instanceId: "claudeAgent",
      enabled: false,
      models: [{ slug: "claude-fable-5" }],
    }),
    provider({
      provider: ProviderDriverKind.make("codex"),
      instanceId: "codex_other_env",
      availability: "unavailable",
      models: [{ slug: "gpt-other" }],
    }),
  ]);

  it("rejects disabled, missing, or non-ready instances", () => {
    expect(
      isModelSelectionUsableInEnvironment(
        createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-fable-5"),
        entries,
      ),
    ).toBe(false);
    expect(
      isModelSelectionUsableInEnvironment(
        createModelSelection(ProviderInstanceId.make("missing"), "gpt-5.4"),
        entries,
      ),
    ).toBe(false);
    expect(
      isModelSelectionUsableInEnvironment(
        createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4"),
        entries,
      ),
    ).toBe(true);

    const errored = deriveProviderInstanceEntries([
      provider({
        provider: codex,
        instanceId: "codex",
        status: "error",
        models: [{ slug: "gpt-5.4" }],
      }),
    ]);
    expect(
      isModelSelectionUsableInEnvironment(
        createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4"),
        errored,
      ),
    ).toBe(false);
  });

  it("skips a non-ready sticky/default and falls back to the next ready entry", () => {
    const mixed = deriveProviderInstanceEntries([
      provider({
        provider: codex,
        instanceId: "codex",
        status: "error",
        models: [{ slug: "gpt-broken" }],
      }),
      provider({
        provider: claude,
        instanceId: "claudeAgent",
        models: [{ slug: "claude-fable-5" }],
      }),
    ]);
    const sticky = createModelSelection(ProviderInstanceId.make("codex"), "gpt-broken");
    expect(
      resolveSpawnModelSelection({
        sticky,
        projectDefault: sticky,
        entries: mixed,
      }),
    ).toEqual(createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-fable-5"));
  });

  it("skips stale sticky selection and uses the project default when usable", () => {
    const sticky = createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-fable-5");
    const projectDefault = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4");
    expect(
      resolveSpawnModelSelection({
        sticky,
        projectDefault,
        entries,
      }),
    ).toEqual(projectDefault);
  });

  it("falls back to the first usable environment entry when sticky and default are stale", () => {
    const sticky = createModelSelection(ProviderInstanceId.make("missing"), "x");
    const projectDefault = createModelSelection(ProviderInstanceId.make("claudeAgent"), "y");
    expect(
      resolveSpawnModelSelection({
        sticky,
        projectDefault,
        entries,
      }),
    ).toEqual(createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4"));
  });

  it("prefers an explicit selection only when it is usable in the environment", () => {
    const explicit = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4");
    const sticky = createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-fable-5");
    expect(resolveSpawnModelSelection({ explicit, sticky, entries })).toEqual(explicit);

    const staleExplicit = createModelSelection(ProviderInstanceId.make("missing"), "nope");
    expect(resolveSpawnModelSelection({ explicit: staleExplicit, sticky, entries })).toEqual(
      createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4"),
    );
  });

  it("returns null when no environment entries are usable (no hardcoded Codex fallback)", () => {
    const empty = deriveProviderInstanceEntries([
      provider({ provider: claude, instanceId: "claudeAgent", enabled: false }),
    ]);
    expect(resolveSpawnModelSelection({ entries: empty })).toBeNull();
  });

  it("rewrites a sticky model that is hidden by fork policy to a selectable model", () => {
    const withHaiku = deriveProviderInstanceEntries([
      provider({
        provider: claude,
        instanceId: "claudeAgent",
        models: [
          { slug: "claude-haiku-4-5" },
          { slug: "claude-fable-5" },
          { slug: "claude-opus-4-6" },
        ],
      }),
    ]);
    const sticky = createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-haiku-4-5");
    expect(resolveSpawnModelSelection({ sticky, entries: withHaiku })).toEqual(
      createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-fable-5"),
    );
  });

  it("rewrites a sticky model absent from the provider list to the entry default", () => {
    const sticky = createModelSelection(ProviderInstanceId.make("codex"), "stale-model-slug");
    expect(resolveSpawnModelSelection({ sticky, entries })).toEqual(
      createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4"),
    );
  });

  it("uses a settings-aware resolveModelForEntry when provided", () => {
    const sticky = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.4");
    expect(
      resolveSpawnModelSelection({
        sticky,
        entries,
        resolveModelForEntry: () => "resolved-from-settings",
      }),
    ).toEqual(createModelSelection(ProviderInstanceId.make("codex"), "resolved-from-settings"));
  });
});

describe("resolveSpawnModelForEntry", () => {
  it("keeps a selectable model and falls back when hidden or missing", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: claude,
        instanceId: "claudeAgent",
        models: [{ slug: "claude-haiku-4-5" }, { slug: "claude-fable-5" }],
      }),
    ]);
    expect(entry).toBeDefined();
    if (!entry) return;

    expect(resolveSpawnModelForEntry(entry, "claude-fable-5")).toBe("claude-fable-5");
    expect(resolveSpawnModelForEntry(entry, "claude-haiku-4-5")).toBe("claude-fable-5");
    expect(resolveSpawnModelForEntry(entry, "missing")).toBe("claude-fable-5");
    expect(resolveSpawnModelForEntry(entry, null)).toBe("claude-fable-5");
  });

  it("falls back to entry.models[0] when every catalog model is fork-hidden", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: claude,
        instanceId: "claudeAgent",
        models: [{ slug: "claude-haiku-4-5" }],
      }),
    ]);
    expect(entry).toBeDefined();
    if (!entry) return;

    // defaultSelectableModelsForEntry filters Haiku → empty list; last resort
    // keeps the instance usable (composer parity).
    expect(resolveSpawnModelForEntry(entry, "claude-haiku-4-5")).toBe("claude-haiku-4-5");
    expect(resolveSpawnModelForEntry(entry, null)).toBe("claude-haiku-4-5");
    expect(resolveSpawnModelForEntry(entry, "missing")).toBe("claude-haiku-4-5");
  });

  it("uses a caller-supplied selectable list when non-empty", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: claude,
        instanceId: "claudeAgent",
        models: [{ slug: "claude-haiku-4-5" }, { slug: "claude-fable-5" }],
      }),
    ]);
    expect(entry).toBeDefined();
    if (!entry) return;

    expect(resolveSpawnModelForEntry(entry, "claude-fable-5", [{ slug: "claude-opus-4-6" }])).toBe(
      "claude-opus-4-6",
    );
  });
});

describe("resolveSpawnModelSelection with only-hidden models", () => {
  it("does not fail the batch when the only ready entry has only fork-hidden models", () => {
    const onlyHaiku = deriveProviderInstanceEntries([
      provider({
        provider: claude,
        instanceId: "claudeAgent",
        models: [{ slug: "claude-haiku-4-5" }],
      }),
    ]);
    const sticky = createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-haiku-4-5");
    expect(resolveSpawnModelSelection({ sticky, entries: onlyHaiku })).toEqual(
      createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-haiku-4-5"),
    );
    expect(resolveSpawnModelSelection({ entries: onlyHaiku })).toEqual(
      createModelSelection(ProviderInstanceId.make("claudeAgent"), "claude-haiku-4-5"),
    );
  });
});
