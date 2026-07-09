// GLITCHY (gl11tchy): fork-owned orchestration layer — one worktree-thread row (status, diff, actions)
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Link } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { buildThreadRouteParams } from "../../threadRoutes";
import type { SidebarThreadSummary } from "../../types";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { ThreadRowLeadingStatus, ThreadWorktreeIndicator } from "../ThreadStatusIndicators";
import { OrchestratorThreadDiff } from "./OrchestratorThreadDiff";
import {
  useWorktreeThreadActions,
  type WorktreeThreadActionsResult,
} from "./useWorktreeThreadActions";

interface OrchestratorFleetRowProps {
  thread: SidebarThreadSummary;
}

interface ActionFeedback {
  tone: "success" | "error";
  message: string;
}

export function OrchestratorFleetRow({ thread }: OrchestratorFleetRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmDefaultBranchPr, setConfirmDefaultBranchPr] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const worktreePath = thread.worktreePath ?? "";
  const threadRouteParams = useMemo(
    () => buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
    [thread.environmentId, thread.id],
  );

  const {
    createPullRequest,
    deleteThread,
    isPreparingPr,
    isDeleting,
    isDefaultBranch,
    isStatusLoading,
  } = useWorktreeThreadActions({
    environmentId: thread.environmentId,
    threadId: thread.id,
    worktreePath,
    title: thread.title,
  });

  const applyResult = useCallback((result: WorktreeThreadActionsResult, successMessage: string) => {
    setFeedback(
      result.ok
        ? { tone: "success", message: successMessage }
        : { tone: "error", message: result.error ?? "Action failed." },
    );
  }, []);

  const handleCreatePr = useCallback(async () => {
    // Preserve GitActionsControl's default-branch gate: first click arms
    // confirmation when the worktree is on the default ref; second click runs.
    if (isDefaultBranch && !confirmDefaultBranchPr) {
      setConfirmDefaultBranchPr(true);
      setConfirmRemove(false);
      setFeedback({
        tone: "error",
        message:
          "This checkout is on the default branch. Click PR again to commit & push there, or open the thread to create a feature branch first.",
      });
      return;
    }
    setConfirmDefaultBranchPr(false);
    setFeedback(null);
    applyResult(
      await createPullRequest({ confirmDefaultBranch: isDefaultBranch }),
      "Pull request flow completed.",
    );
  }, [applyResult, confirmDefaultBranchPr, createPullRequest, isDefaultBranch]);

  const handleDelete = useCallback(async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      setConfirmDefaultBranchPr(false);
      return;
    }
    setConfirmRemove(false);
    setFeedback(null);
    // deleteThread only guarantees the thread is gone — worktree removal is
    // optional (browser has no confirm path; desktop can decline the prompt).
    applyResult(await deleteThread(), "Thread deleted.");
  }, [applyResult, confirmRemove, deleteThread]);

  const busy = isPreparingPr || isDeleting;

  return (
    <li className="rounded-md border border-border/60 bg-card/40 transition-colors hover:border-primary/30">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground/70"
          aria-label={expanded ? "Collapse diff" : "Expand diff"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </Button>

        <ThreadRowLeadingStatus thread={thread} />

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="glitch-rgb truncate font-mono text-[13px] text-foreground">
            {thread.title}
          </span>
          <span className="flex items-center gap-1.5 truncate font-mono text-[10px] text-muted-foreground/70">
            <ThreadWorktreeIndicator thread={thread} />
            {thread.branch ?? worktreePath}
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground/80"
          render={<Link to="/$environmentId/$threadId" params={threadRouteParams} />}
        >
          <ExternalLinkIcon className="size-3.5" />
          Open
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={`h-7 gap-1 px-2 text-[11px] ${
            confirmDefaultBranchPr ? "border-destructive/60 text-destructive" : ""
          }`}
          disabled={busy || worktreePath.length === 0 || isStatusLoading}
          onClick={handleCreatePr}
          onBlur={() => setConfirmDefaultBranchPr(false)}
        >
          {isPreparingPr ? (
            <Spinner className="size-3.5" />
          ) : (
            <GitPullRequestIcon className="size-3.5" />
          )}
          {confirmDefaultBranchPr ? "Confirm PR?" : "PR"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1 px-2 text-[11px] ${
            confirmRemove ? "text-destructive" : "text-muted-foreground/80"
          }`}
          disabled={busy || worktreePath.length === 0}
          onClick={handleDelete}
          onBlur={() => setConfirmRemove(false)}
        >
          {isDeleting ? <Spinner className="size-3.5" /> : <Trash2Icon className="size-3.5" />}
          {confirmRemove ? "Confirm?" : "Delete"}
        </Button>
      </div>

      {feedback ? (
        <p
          className={`px-3 pb-2 font-mono text-[11px] ${
            feedback.tone === "error" ? "text-destructive" : "text-primary"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      {expanded ? (
        <div className="border-t border-border/50">
          <OrchestratorThreadDiff
            environmentId={thread.environmentId}
            threadId={thread.id}
            enabled={expanded}
          />
        </div>
      ) : null}
    </li>
  );
}
