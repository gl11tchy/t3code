// GLITCHY (gl11tchy): fork-owned orchestration layer — pure spawn-plan validation & outcome aggregation
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";

import { HIDDEN_MODEL_SLUGS } from "../../glitchModelPolicy";
import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";

/** Matches the public hook input shape (logic layer only needs prompt + count). */
export interface SpawnWorktreeAgentsPlanInput {
  projectRef: ScopedProjectRef;
  prompt: string;
  count: number;
  modelSelection?: ModelSelection;
  baseBranch?: string;
}

export interface SpawnAgentDescriptor {
  /** 0-based agent index. */
  index: number;
}

export interface SpawnPlan {
  /** Clamped agent count in 1..8. */
  count: number;
  /** Trimmed prompt when valid; otherwise the original input prompt. */
  prompt: string;
  /** Present when the prompt is empty/whitespace-only after trim. */
  promptError?: string;
  /** Exactly `count` descriptors, indexes 0..count-1. */
  agents: SpawnAgentDescriptor[];
}

export interface SpawnAgentOutcome {
  index: number;
  ok: boolean;
  threadId?: string;
  error?: string;
}

export interface SpawnWorktreeAgentsResult {
  outcomes: SpawnAgentOutcome[];
  succeeded: number;
  failed: number;
}

export const MIN_SPAWN_COUNT = 1;
export const MAX_SPAWN_COUNT = 8;

export const EMPTY_PROMPT_ERROR = "Prompt must not be empty.";

export const NO_READY_PROVIDER_ERROR =
  "No ready provider is available in the target environment. Enable a provider and try again.";

/**
 * Clamp spawn count into the allowed range [1, 8].
 * Non-finite values fall back to 1; fractional values are floored.
 */
export function clampSpawnCount(count: number): number {
  if (!Number.isFinite(count)) {
    return MIN_SPAWN_COUNT;
  }
  return Math.min(MAX_SPAWN_COUNT, Math.max(MIN_SPAWN_COUNT, Math.floor(count)));
}

/**
 * Validate input and build a per-agent plan.
 * Never throws — empty prompts are reported via `promptError` while still
 * producing `count` agent descriptors so the hook can fail each outcome.
 */
export function buildSpawnPlan(
  input: Pick<SpawnWorktreeAgentsPlanInput, "prompt" | "count">,
): SpawnPlan {
  const count = clampSpawnCount(input.count);
  const trimmed = input.prompt.trim();
  const agents: SpawnAgentDescriptor[] = Array.from({ length: count }, (_, index) => ({
    index,
  }));

  if (trimmed.length === 0) {
    return {
      count,
      prompt: input.prompt,
      promptError: EMPTY_PROMPT_ERROR,
      agents,
    };
  }

  return {
    count,
    prompt: trimmed,
    agents,
  };
}

/** Count successes/failures; preserves the outcomes array reference. */
export function summarizeOutcomes(outcomes: SpawnAgentOutcome[]): SpawnWorktreeAgentsResult {
  let succeeded = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome.ok) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }
  return { outcomes, succeeded, failed };
}

/** Build an all-failed outcome list of the given length with the same error. */
export function makeUniformFailedOutcomes(count: number, error: string): SpawnAgentOutcome[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    ok: false,
    error,
  }));
}

export function formatUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

/**
 * True when the selection's provider instance exists in the target environment
 * and can accept a session — same bar as the model picker (enabled + available
 * + probe status "ready"). Stale sticky selections from another environment, a
 * disabled instance, or a failed/checking probe must not be used for spawn.
 */
export function isModelSelectionUsableInEnvironment(
  selection: ModelSelection,
  entries: ReadonlyArray<ProviderInstanceEntry>,
): boolean {
  const entry = entries.find((candidate) => candidate.instanceId === selection.instanceId);
  return entry !== undefined && isProviderInstancePickerReady(entry);
}

const HIDDEN_MODEL_SLUG_SET = new Set(HIDDEN_MODEL_SLUGS);

/**
 * Default selectable models for an entry when the caller does not supply a
 * settings-aware resolver: built-in models minus fork-hidden slugs, plus customs.
 */
export function defaultSelectableModelsForEntry(
  entry: ProviderInstanceEntry,
): ReadonlyArray<{ slug: string; isCustom: boolean }> {
  return entry.models
    .filter((model) => model.isCustom || !HIDDEN_MODEL_SLUG_SET.has(model.slug))
    .map((model) => ({ slug: model.slug, isCustom: model.isCustom }));
}

/**
 * Resolve a candidate model slug against a ready entry's selectable options.
 * Missing/hidden slugs fall back to the entry's first non-custom option, then
 * first option — same shape as the composer picker fallback. When the selectable
 * list is empty (every catalog model is fork-hidden), fall back to
 * `entry.models[0]` as last resort so spawn stays available like the composer.
 */
export function resolveSpawnModelForEntry(
  entry: ProviderInstanceEntry,
  selectedModel: string | null | undefined,
  selectableModels?: ReadonlyArray<{ slug: string; isCustom?: boolean }> | null,
): string | null {
  const options =
    selectableModels && selectableModels.length > 0
      ? selectableModels
      : defaultSelectableModelsForEntry(entry);

  if (options.length === 0) {
    return entry.models[0]?.slug ?? null;
  }

  const trimmed = typeof selectedModel === "string" ? selectedModel.trim() : "";
  if (trimmed.length > 0 && options.some((option) => option.slug === trimmed)) {
    return trimmed;
  }

  return (
    options.find((option) => !option.isCustom)?.slug ??
    options[0]?.slug ??
    entry.models[0]?.slug ??
    DEFAULT_MODEL_BY_PROVIDER[entry.driverKind] ??
    DEFAULT_MODEL
  );
}

export type ResolveSpawnModelForEntry = (
  entry: ProviderInstanceEntry,
  selectedModel: string | null | undefined,
) => string | null;

/**
 * Optional composer-parity path for provider option defaults (reasoning effort,
 * service tier, etc.). Receives any persisted candidate options so sticky
 * overrides are preserved while missing defaults are filled from descriptors.
 */
export type ResolveSpawnModelOptionsForEntry = (
  entry: ProviderInstanceEntry,
  model: string,
  candidateOptions: ModelSelection["options"] | undefined,
) => ModelSelection["options"] | undefined;

/**
 * Resolve model selection for a spawn batch against the *target* environment's
 * provider entries. Priority: explicit → sticky → project default → first
 * ready entry in the environment.
 *
 * Sticky/project defaults that point at a missing, disabled, or non-ready
 * instance are skipped so ProviderService.startSession does not reject the
 * whole batch. Candidate model slugs are resolved against the target entry
 * (hidden/absent models fall back within that instance). Returns `null` when
 * no picker-ready provider with a selectable model exists — never hardcodes a
 * missing Codex instance.
 */
export function resolveSpawnModelSelection(input: {
  explicit?: ModelSelection | null | undefined;
  sticky?: ModelSelection | null | undefined;
  projectDefault?: ModelSelection | null | undefined;
  entries: ReadonlyArray<ProviderInstanceEntry>;
  /**
   * Optional settings-aware model resolver (composer parity). When omitted,
   * uses entry.models minus fork-hidden slugs.
   */
  resolveModelForEntry?: ResolveSpawnModelForEntry;
  /**
   * Optional settings-aware option resolver (composer parity). When omitted,
   * candidate.options are passed through as-is and fallback selections have
   * no options.
   */
  resolveModelOptionsForEntry?: ResolveSpawnModelOptionsForEntry;
}): ModelSelection | null {
  const resolveModel =
    input.resolveModelForEntry ??
    ((entry: ProviderInstanceEntry, selectedModel: string | null | undefined) =>
      resolveSpawnModelForEntry(entry, selectedModel));

  const buildSelection = (
    entry: ProviderInstanceEntry,
    model: string,
    candidateOptions: ModelSelection["options"] | undefined,
  ): ModelSelection => {
    const options =
      input.resolveModelOptionsForEntry?.(entry, model, candidateOptions) ?? candidateOptions;
    return createModelSelection(entry.instanceId, model, options);
  };

  const trySelection = (candidate: ModelSelection | null | undefined): ModelSelection | null => {
    if (!candidate || !isModelSelectionUsableInEnvironment(candidate, input.entries)) {
      return null;
    }
    const entry = input.entries.find(
      (candidateEntry) => candidateEntry.instanceId === candidate.instanceId,
    );
    if (!entry) {
      return null;
    }
    const model = resolveModel(entry, candidate.model);
    if (!model) {
      return null;
    }
    return buildSelection(entry, model, candidate.options);
  };

  const candidates: Array<ModelSelection | null | undefined> = [
    input.explicit,
    input.sticky,
    input.projectDefault,
  ];
  for (const candidate of candidates) {
    const resolved = trySelection(candidate);
    if (resolved) {
      return resolved;
    }
  }

  const fallbackEntry = input.entries.find((entry) => isProviderInstancePickerReady(entry));
  if (fallbackEntry) {
    const model = resolveModel(fallbackEntry, null);
    if (model) {
      return buildSelection(fallbackEntry, model, undefined);
    }
  }

  return null;
}
