// GLITCHY (gl11tchy): fork-owned orchestration layer — unit tests for Codex-delegate pure logic
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import {
  buildCodexModelSelection,
  isCodexAvailableFromEntries,
  normalizeDelegateToCodexInput,
  pickCodexDefaultModel,
  resolveCodexInstance,
} from "./delegateToCodex.logic";

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
    models: (input.models ?? []).map((model) => ({
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

describe("resolveCodexInstance", () => {
  it("prefers the default codex instance when enabled and available", () => {
    const entries = deriveProviderInstanceEntries([
      provider({
        provider: codex,
        instanceId: "codex_personal",
        models: [{ slug: "gpt-custom" }],
      }),
      provider({
        provider: codex,
        instanceId: "codex",
        models: [{ slug: "gpt-5.4" }],
      }),
      provider({ provider: claude, instanceId: "claudeAgent" }),
    ]);

    const resolved = resolveCodexInstance(entries);
    expect(resolved?.instanceId).toBe("codex");
  });

  it("falls back to the first enabled+available codex instance when default is unusable", () => {
    const entries = deriveProviderInstanceEntries([
      provider({
        provider: codex,
        instanceId: "codex",
        enabled: false,
        models: [{ slug: "gpt-5.4" }],
      }),
      provider({
        provider: codex,
        instanceId: "codex_work",
        models: [{ slug: "gpt-custom" }],
      }),
    ]);

    const resolved = resolveCodexInstance(entries);
    expect(resolved?.instanceId).toBe("codex_work");
  });

  it("returns null when no codex instance is enabled and available", () => {
    const entries = deriveProviderInstanceEntries([
      provider({
        provider: codex,
        instanceId: "codex",
        enabled: false,
      }),
      provider({
        provider: codex,
        instanceId: "codex_shadow",
        availability: "unavailable",
      }),
      provider({ provider: claude, instanceId: "claudeAgent" }),
    ]);

    expect(resolveCodexInstance(entries)).toBeNull();
  });

  it("rejects an enabled codex instance whose probe status is not ready", () => {
    const entries = deriveProviderInstanceEntries([
      provider({
        provider: codex,
        instanceId: "codex",
        status: "error",
        models: [{ slug: "gpt-5.4" }],
      }),
    ]);
    expect(resolveCodexInstance(entries)).toBeNull();
  });

  it("ignores non-codex providers even when they are ready", () => {
    const entries = deriveProviderInstanceEntries([
      provider({ provider: claude, instanceId: "claudeAgent" }),
    ]);
    expect(resolveCodexInstance(entries)).toBeNull();
  });
});

describe("isCodexAvailableFromEntries", () => {
  it("is true when a usable codex instance exists", () => {
    const entries = deriveProviderInstanceEntries([
      provider({ provider: codex, instanceId: "codex" }),
    ]);
    expect(isCodexAvailableFromEntries(entries)).toBe(true);
  });

  it("is false when no usable codex instance exists", () => {
    const entries = deriveProviderInstanceEntries([
      provider({ provider: codex, instanceId: "codex", enabled: false }),
    ]);
    expect(isCodexAvailableFromEntries(entries)).toBe(false);
  });
});

describe("pickCodexDefaultModel / buildCodexModelSelection", () => {
  it("prefers the first non-custom model slug", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: codex,
        instanceId: "codex",
        models: [
          { slug: "my-finetune", isCustom: true },
          { slug: "gpt-5.3-codex", isCustom: false },
        ],
      }),
    ]);
    expect(entry).toBeDefined();
    expect(pickCodexDefaultModel(entry!)).toBe("gpt-5.3-codex");
    expect(buildCodexModelSelection(entry!)).toEqual({
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.3-codex",
    });
  });

  it("falls back to contracts default when the instance has no models", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({ provider: codex, instanceId: "codex", models: [] }),
    ]);
    expect(entry).toBeDefined();
    const expected = DEFAULT_MODEL_BY_PROVIDER[codex] ?? DEFAULT_MODEL;
    expect(pickCodexDefaultModel(entry!)).toBe(expected);
  });
});

describe("normalizeDelegateToCodexInput", () => {
  it("preserves an empty prompt and defaults envMode to local", () => {
    expect(normalizeDelegateToCodexInput({ prompt: "" })).toEqual({
      prompt: "",
      envMode: "local",
    });
  });

  it("passes through an explicit worktree envMode and non-empty prompt", () => {
    expect(normalizeDelegateToCodexInput({ prompt: "fix this", envMode: "worktree" })).toEqual({
      prompt: "fix this",
      envMode: "worktree",
    });
  });
});
