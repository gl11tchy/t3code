// GLITCHY (gl11tchy): fork-owned orchestration layer — pure fleet/spawn presentation logic
import type { ReviewDiffPreviewSource } from "@t3tools/contracts";

import type { SidebarThreadSummary } from "../../types";
import type { ThreadStatusPill } from "../Sidebar.logic";
import {
  clampSpawnCount,
  MAX_SPAWN_COUNT,
  MIN_SPAWN_COUNT,
  type SpawnWorktreeAgentsResult,
} from "./spawnWorktreeAgents.logic";

/** Canonical route for the orchestrator dashboard (file-based TanStack route). */
export const ORCHESTRATOR_ROUTE_PATH = "/glitch/orchestrator" as const;

/**
 * Show the committed branch range first and the uncommitted working tree
 * second. A PR can contain both, so neither source may hide the other.
 */
export function selectVisibleDiffPreviewSources(
  sources: ReadonlyArray<ReviewDiffPreviewSource>,
): ReviewDiffPreviewSource[] {
  return (["branch-range", "working-tree"] as const).flatMap((kind) => {
    const source = sources.find((candidate) => candidate.kind === kind);
    return source && source.diff.trim().length > 0 ? [source] : [];
  });
}

/**
 * Active worktree thread: non-empty worktreePath and not archived.
 * Matches the sidebar, which filters `archivedAt === null` before listing
 * threads — archived shells still retain worktreePath and would otherwise
 * reappear in the orchestrator fleet with PR/Delete actions.
 */
export function isWorktreeThread(thread: SidebarThreadSummary): boolean {
  return thread.archivedAt === null && (thread.worktreePath?.trim().length ?? 0) > 0;
}

/**
 * Keep only active worktree-backed threads and sort most-recently-updated first
 * so the fleet reads top-down by freshness. Pure — returns a new array.
 */
export function filterWorktreeThreads(
  threads: ReadonlyArray<SidebarThreadSummary>,
): SidebarThreadSummary[] {
  return threads
    .filter(isWorktreeThread)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface FleetStatusCounts {
  /** Actively running turns (Working / Connecting). */
  readonly working: number;
  /** Needs the operator (Pending Approval / Awaiting Input / Plan Ready). */
  readonly attention: number;
  /** Finished a turn cleanly (Completed). */
  readonly completed: number;
  /** No resolvable status pill. */
  readonly idle: number;
  readonly total: number;
}

/**
 * Bucket per-thread status pill labels into at-a-glance fleet counts.
 * `null` labels (no resolvable status) count as idle.
 */
export function summarizeFleetStatuses(
  labels: ReadonlyArray<ThreadStatusPill["label"] | null>,
): FleetStatusCounts {
  let working = 0;
  let attention = 0;
  let completed = 0;
  let idle = 0;

  for (const label of labels) {
    switch (label) {
      case "Working":
      case "Connecting":
        working += 1;
        break;
      case "Pending Approval":
      case "Awaiting Input":
      case "Plan Ready":
        attention += 1;
        break;
      case "Completed":
        completed += 1;
        break;
      default:
        idle += 1;
        break;
    }
  }

  return { working, attention, completed, idle, total: labels.length };
}

export type SpawnOutcomeTone = "success" | "partial" | "error";

export interface SpawnOutcomeSummary {
  readonly tone: SpawnOutcomeTone;
  readonly headline: string;
}

/** Human headline + tone for a completed spawn batch — a partial failure must read as partial. */
export function describeSpawnOutcome(result: SpawnWorktreeAgentsResult): SpawnOutcomeSummary {
  const { succeeded, failed } = result;

  if (succeeded > 0 && failed === 0) {
    return {
      tone: "success",
      headline: `Spawned ${succeeded} ${pluralizeAgent(succeeded)}.`,
    };
  }

  if (succeeded > 0 && failed > 0) {
    return {
      tone: "partial",
      headline: `Spawned ${succeeded} ${pluralizeAgent(succeeded)}, ${failed} failed.`,
    };
  }

  return {
    tone: "error",
    headline:
      failed > 0 ? `All ${failed} ${pluralizeAgent(failed)} failed.` : "No agents were spawned.",
  };
}

function pluralizeAgent(count: number): string {
  return count === 1 ? "agent" : "agents";
}

/** Step the spawn-count stepper by delta, clamped to the allowed [1, 8] range. */
export function stepSpawnCount(current: number, delta: number): number {
  return clampSpawnCount(current + delta);
}

export { clampSpawnCount, MAX_SPAWN_COUNT, MIN_SPAWN_COUNT };
