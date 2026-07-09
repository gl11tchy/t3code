// GLITCHY (gl11tchy): fork-owned orchestration layer — pure Codex-delegate resolution helpers
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ModelSelection,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";

import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";

const CODEX_DRIVER = ProviderDriverKind.make("codex");
const DEFAULT_CODEX_INSTANCE_ID: ProviderInstanceId = defaultInstanceIdForDriver(CODEX_DRIVER);

export type DelegateEnvMode = "local" | "worktree";

export interface NormalizedDelegateToCodexInput {
  readonly prompt: string;
  readonly envMode: DelegateEnvMode;
}

/**
 * True when a Codex provider instance can actually take a draft: enabled,
 * available, AND probe status "ready" — the same bar the model picker uses.
 * An enabled instance with a failed CLI/auth probe streams `status: "error"`
 * while staying "available", and must not be delegated to.
 */
export function isCodexEntryUsable(entry: ProviderInstanceEntry): boolean {
  return entry.driverKind === CODEX_DRIVER && isProviderInstancePickerReady(entry);
}

/**
 * Prefer the default Codex instance (`instanceId "codex"` when enabled+available),
 * otherwise the first enabled+available entry with `driverKind === "codex"`.
 */
export function resolveCodexInstance(
  entries: ReadonlyArray<ProviderInstanceEntry>,
): ProviderInstanceEntry | null {
  const defaultInstance = entries.find(
    (entry) => entry.instanceId === DEFAULT_CODEX_INSTANCE_ID && isCodexEntryUsable(entry),
  );
  if (defaultInstance) {
    return defaultInstance;
  }
  return entries.find((entry) => isCodexEntryUsable(entry)) ?? null;
}

export function isCodexAvailableFromEntries(
  entries: ReadonlyArray<ProviderInstanceEntry>,
): boolean {
  return resolveCodexInstance(entries) !== null;
}

/**
 * Pick the instance's default model: first non-custom model, else first model,
 * else the contracts default for the driver / global DEFAULT_MODEL.
 */
export function pickCodexDefaultModel(entry: ProviderInstanceEntry): string {
  return (
    entry.models.find((model) => !model.isCustom)?.slug ??
    entry.models[0]?.slug ??
    DEFAULT_MODEL_BY_PROVIDER[entry.driverKind] ??
    DEFAULT_MODEL
  );
}

export function buildCodexModelSelection(entry: ProviderInstanceEntry): ModelSelection {
  return createModelSelection(entry.instanceId, pickCodexDefaultModel(entry));
}

/**
 * Normalize hook input: prompt is left as-is (empty string allowed);
 * envMode defaults to `"local"`.
 */
export function normalizeDelegateToCodexInput(input: {
  prompt: string;
  envMode?: DelegateEnvMode;
}): NormalizedDelegateToCodexInput {
  return {
    prompt: input.prompt,
    envMode: input.envMode ?? "local",
  };
}
