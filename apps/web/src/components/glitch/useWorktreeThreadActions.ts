// GLITCHY (gl11tchy): fork-owned orchestration layer — per-worktree-thread git actions (PR + cleanup)
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";

import { randomHex } from "../../lib/utils";
import { useThreadActions } from "../../hooks/useThreadActions";
import { useGitStackedAction } from "../../state/sourceControlActions";
import { formatUnknownError } from "./spawnWorktreeAgents.logic";

export interface WorktreeThreadActionsInput {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  /** The worktree checkout path — the cwd git commands run in for PR/push. */
  worktreePath: string;
  /** Commit message seed for the stacked PR action (thread title). */
  title: string;
}

export interface WorktreeThreadActionsResult {
  ok: boolean;
  error?: string;
}

/**
 * Wire the two worktree-thread actions that compose soundly from outside their
 * original components (per the Phase 3 integration map §8):
 *   - `createPullRequest` → `useGitStackedAction` with the `commit_push_pr` flow.
 *   - `deleteThread`      → the app's own thread-delete flow (`useThreadActions`),
 *     which stops the session and removes the thread's now-orphaned worktree —
 *     removing only the worktree would leave a live thread row pointing at a
 *     deleted path.
 *
 * Both never reject; failures come back on the returned result.
 */
export function useWorktreeThreadActions(input: WorktreeThreadActionsInput): {
  createPullRequest: () => Promise<WorktreeThreadActionsResult>;
  deleteThread: () => Promise<WorktreeThreadActionsResult>;
  isPreparingPr: boolean;
  isDeleting: boolean;
} {
  const { environmentId, threadId, worktreePath, title } = input;

  const prScope = useMemo(
    () => ({ environmentId, cwd: worktreePath }),
    [environmentId, worktreePath],
  );
  const stackedAction = useGitStackedAction(prScope);

  const { deleteThread: deleteThreadAction } = useThreadActions();
  const [isDeleting, setIsDeleting] = useState(false);

  const createPullRequest = useCallback(async (): Promise<WorktreeThreadActionsResult> => {
    try {
      const result = await stackedAction.run({
        actionId: `glitch-pr-${randomHex(8)}`,
        action: "commit_push_pr",
        ...(title.trim().length > 0 ? { commitMessage: title.trim() } : {}),
      });
      if (result._tag === "Failure") {
        return {
          ok: false,
          error: formatUnknownError(
            squashAtomCommandFailure(result),
            "Failed to create pull request.",
          ),
        };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: formatUnknownError(error, "Failed to create pull request.") };
    }
  }, [stackedAction, title]);

  const deleteThread = useCallback(async (): Promise<WorktreeThreadActionsResult> => {
    if (isDeleting) {
      return { ok: false, error: "Thread deletion already in progress." };
    }
    setIsDeleting(true);
    try {
      const result = await deleteThreadAction(scopeThreadRef(environmentId, threadId));
      if (result._tag === "Failure") {
        return {
          ok: false,
          error: formatUnknownError(squashAtomCommandFailure(result), "Failed to delete thread."),
        };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: formatUnknownError(error, "Failed to delete thread.") };
    } finally {
      setIsDeleting(false);
    }
  }, [deleteThreadAction, environmentId, isDeleting, threadId]);

  return {
    createPullRequest,
    deleteThread,
    isPreparingPr: stackedAction.isPending,
    isDeleting,
  };
}
