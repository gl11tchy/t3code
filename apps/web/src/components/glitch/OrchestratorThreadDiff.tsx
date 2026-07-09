// GLITCHY (gl11tchy): fork-owned orchestration layer — lazy per-worktree-thread diff inspector
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useCheckpointDiff } from "../../lib/checkpointDiffState";
import {
  buildFileDiffRenderKey,
  getRenderablePatch,
  resolveDiffThemeName,
  resolveFileDiffPath,
} from "../../lib/diffRendering";
import { useTheme } from "../../hooks/useTheme";
import { useThread } from "../../state/entities";
import { AnnotatableCodeView } from "../diffs/AnnotatableCodeView";
import { Spinner } from "../ui/spinner";

interface OrchestratorThreadDiffProps {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  /** Only fetch + render when the row is expanded (lazy). */
  enabled: boolean;
}

function StatusLine({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2 font-mono text-[11px] text-muted-foreground/75">{children}</p>;
}

export function OrchestratorThreadDiff({
  environmentId,
  threadId,
  enabled,
}: OrchestratorThreadDiffProps) {
  const threadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );

  // Thread detail carries the checkpoints; bound the full-thread diff at the
  // LATEST READY checkpoint (fromTurnCount 0 → routes to fullThreadDiff). A
  // running turn streams a "missing"-status placeholder checkpoint whose ref
  // does not exist yet — diffing against it would fail. Only loaded while expanded.
  const thread = useThread(enabled ? threadRef : null);
  const checkpoints = thread?.checkpoints;
  const toTurnCount = useMemo(() => {
    let latestReady = 0;
    for (const checkpoint of checkpoints ?? []) {
      if (checkpoint.status === "ready" && checkpoint.checkpointTurnCount > latestReady) {
        latestReady = checkpoint.checkpointTurnCount;
      }
    }
    return latestReady;
  }, [checkpoints]);

  const diffState = useCheckpointDiff(
    {
      environmentId,
      threadId,
      fromTurnCount: 0,
      toTurnCount,
      ignoreWhitespace: false,
      cacheScope: `glitch-orchestrator:${threadId}`,
    },
    { enabled: enabled && toTurnCount > 0 },
  );

  const { resolvedTheme } = useTheme();
  const patch = diffState.data?.diff;

  const renderablePatch = useMemo(
    () => getRenderablePatch(patch, `glitch-orchestrator:${resolvedTheme}`),
    [patch, resolvedTheme],
  );

  const codeViewFiles = useMemo(() => {
    if (renderablePatch?.kind !== "files") {
      return [];
    }
    return renderablePatch.files
      .toSorted((left, right) =>
        resolveFileDiffPath(left).localeCompare(resolveFileDiffPath(right), undefined, {
          sensitivity: "base",
        }),
      )
      .map((fileDiff) => ({
        fileDiff,
        filePath: resolveFileDiffPath(fileDiff),
        fileKey: buildFileDiffRenderKey(fileDiff),
        collapsed: false,
      }));
  }, [renderablePatch]);

  if (!enabled) {
    return null;
  }

  if (toTurnCount === 0) {
    return <StatusLine>No completed turns yet — nothing to diff.</StatusLine>;
  }

  if (diffState.isPending && !patch) {
    return (
      <p className="flex items-center gap-2 px-3 py-2 font-mono text-[11px] text-muted-foreground/75">
        <Spinner className="size-3" />
        Loading worktree diff…
      </p>
    );
  }

  if (diffState.error) {
    return (
      <StatusLine>
        <span className="text-destructive">Diff failed:</span> {diffState.error}
      </StatusLine>
    );
  }

  if (!patch || patch.trim().length === 0) {
    return <StatusLine>No changes in this worktree.</StatusLine>;
  }

  if (renderablePatch?.kind === "raw") {
    return (
      <div className="space-y-2 px-3 py-2">
        <p className="font-mono text-[11px] text-muted-foreground/75">{renderablePatch.reason}</p>
        <pre className="overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
          {renderablePatch.text}
        </pre>
      </div>
    );
  }

  return (
    <AnnotatableCodeView
      className="diff-render-surface max-h-[420px] overflow-auto"
      files={codeViewFiles}
      sectionId={`glitch-diff:${threadId}`}
      sectionTitle="Worktree diff"
      composerDraftTarget={threadRef}
      renderHeaderPrefix={() => null}
      options={{
        diffStyle: "unified",
        lineDiffType: "none",
        overflow: "scroll",
        theme: resolveDiffThemeName(resolvedTheme),
        themeType: resolvedTheme as "light" | "dark",
        stickyHeaders: true,
        layout: { paddingTop: 8, paddingBottom: 8, gap: 8 },
      }}
    />
  );
}
