// GLITCHY (gl11tchy): fork-owned orchestration layer — pure spawn-plan validation & outcome aggregation
import type { ModelSelection, ScopedProjectRef } from "@t3tools/contracts";

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
