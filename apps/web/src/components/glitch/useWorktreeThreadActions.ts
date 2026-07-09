// GLITCHY (gl11tchy): fork-owned orchestration layer — per-worktree-thread git actions (PR + cleanup)
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";

import { requiresDefaultBranchConfirmation } from "../GitActionsControl.logic";
import { randomHex } from "../../lib/utils";
import { useThreadActions } from "../../hooks/useThreadActions";
import { useEnvironmentQuery } from "../../state/query";
import { useGitStackedAction } from "../../state/sourceControlActions";
import { vcsEnvironment } from "../../state/vcs";
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
  /**
   * Set when the worktree is on the repository default branch and the caller
   * has not yet confirmed. Matches GitActionsControl's default-branch gate —
   * the UI should re-prompt and call again with `confirmDefaultBranch: true`.
   */
  needsDefaultBranchConfirmation?: boolean;
}

export interface CreatePullRequestOptions {
  /**
   * Required when the worktree checkout is the repository default branch.
   * Without it, the action returns `needsDefaultBranchConfirmation` instead of
   * committing/pushing to the default ref.
   */
  confirmDefaultBranch?: boolean;
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
  createPullRequest: (options?: CreatePullRequestOptions) => Promise<WorktreeThreadActionsResult>;
  deleteThread: () => Promise<WorktreeThreadActionsResult>;
  isPreparingPr: boolean;
  isDeleting: boolean;
  /**
   * True when VCS status reports the worktree is on the default branch.
   * Callers should gate the PR button through a confirmation step (same
   * contract as GitActionsControl's `requiresDefaultBranchConfirmation`).
   * False when status is unknown — use `isBranchStatusKnown` / disable PR.
   */
  isDefaultBranch: boolean;
  /** True while VCS status for the worktree is still loading. */
  isStatusLoading: boolean;
  /**
   * False when status has not loaded (pending finished with no data, or the
   * query errored). GitActionsControl does not expose PR actions without status;
   * callers should disable the PR button when this is false.
   */
  isBranchStatusKnown: boolean;
} {
  const { environmentId, threadId, worktreePath, title } = input;

  const prScope = useMemo(
    () => ({ environmentId, cwd: worktreePath }),
    [environmentId, worktreePath],
  );
  const stackedAction = useGitStackedAction(prScope);

  const gitStatus = useEnvironmentQuery(
    worktreePath.length > 0
      ? vcsEnvironment.status({
          environmentId,
          input: { cwd: worktreePath },
        })
      : null,
  );
  // Failed/missing status must not coerce to "non-default" — that skipped the
  // default-branch confirmation and let commit_push_pr run unsafely.
  const isBranchStatusKnown = gitStatus.data != null;
  const isDefaultBranch = gitStatus.data?.isDefaultRef === true;
  const isStatusLoading = worktreePath.length > 0 && gitStatus.isPending;

  const { deleteThread: deleteThreadAction } = useThreadActions();
  const [isDeleting, setIsDeleting] = useState(false);

  const createPullRequest = useCallback(
    async (options?: CreatePullRequestOptions): Promise<WorktreeThreadActionsResult> => {
      try {
        // Mirror GitActionsControl: refuse PR when branch status is unknown, and
        // never run commit_push_pr on the default branch without confirmation.
        // Orchestrator lists any thread with a worktreePath, not only temps.
        if (!isBranchStatusKnown) {
          return {
            ok: false,
            error:
              gitStatus.error?.trim() ||
              "Could not determine whether this worktree is on the default branch. Open the thread to run git actions, or retry once status loads.",
          };
        }

        if (
          requiresDefaultBranchConfirmation("commit_push_pr", isDefaultBranch) &&
          options?.confirmDefaultBranch !== true
        ) {
          const branchName = gitStatus.data?.refName?.trim() || "the default branch";
          return {
            ok: false,
            needsDefaultBranchConfirmation: true,
            error: `This worktree is on ${branchName}. Confirm to commit and push there, or open the thread and create a feature branch first.`,
          };
        }

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
    },
    [
      gitStatus.data?.refName,
      gitStatus.error,
      isBranchStatusKnown,
      isDefaultBranch,
      stackedAction,
      title,
    ],
  );

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
    isDefaultBranch,
    isStatusLoading,
    isBranchStatusKnown,
  };
}
