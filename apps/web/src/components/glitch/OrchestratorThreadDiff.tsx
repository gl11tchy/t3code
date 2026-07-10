// GLITCHY (gl11tchy): fork-owned orchestration layer — lazy per-worktree-thread live diff
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useMemo } from "react";

import {
  buildFileDiffRenderKey,
  getRenderablePatch,
  resolveDiffThemeName,
  resolveFileDiffPath,
} from "../../lib/diffRendering";
import { useTheme } from "../../hooks/useTheme";
import { useEnvironmentQuery } from "../../state/query";
import { reviewEnvironment } from "../../state/review";
import { AnnotatableCodeView } from "../diffs/AnnotatableCodeView";
import { Spinner } from "../ui/spinner";
import {
  getDiffReviewSectionIdentity,
  selectVisibleDiffPreviewSources,
} from "./orchestrator.logic";

interface OrchestratorThreadDiffProps {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  /** Worktree checkout path — live PR-bound diff is against this cwd. */
  worktreePath: string;
  /** Only fetch + render when the row is expanded (lazy). */
  enabled: boolean;
}

function StatusLine({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2 font-mono text-[11px] text-muted-foreground/75">{children}</p>;
}

/**
 * Live worktree diff for orchestrator rows — matches what the PR action will
 * commit (working tree), not a stale checkpoint-to-checkpoint range that can
 * miss manual/setup-script edits after the latest ready checkpoint.
 */
export function OrchestratorThreadDiff({
  environmentId,
  threadId,
  worktreePath,
  enabled,
}: OrchestratorThreadDiffProps) {
  const threadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );
  const cwd = worktreePath.trim();
  const diffPreview = useEnvironmentQuery(
    enabled && cwd.length > 0
      ? reviewEnvironment.diffPreview({
          environmentId,
          input: {
            cwd,
            ignoreWhitespace: false,
          },
        })
      : null,
  );

  const { resolvedTheme } = useTheme();
  const renderableSources = useMemo(() => {
    const visibleSources = selectVisibleDiffPreviewSources(diffPreview.data?.sources ?? []);
    const visibleSourceKinds = visibleSources.map((source) => source.kind);
    return visibleSources.flatMap((source) => {
      const renderablePatch = getRenderablePatch(
        source.diff,
        `glitch-orchestrator:${source.kind}:${resolvedTheme}`,
      );
      if (!renderablePatch) {
        return [];
      }
      const codeViewFiles =
        renderablePatch.kind === "files"
          ? renderablePatch.files
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
              }))
          : [];
      return [
        {
          source,
          renderablePatch,
          codeViewFiles,
          sectionIdentity: getDiffReviewSectionIdentity(threadId, source.kind, visibleSourceKinds),
        },
      ];
    });
  }, [diffPreview.data?.sources, resolvedTheme, threadId]);

  if (!enabled) {
    return null;
  }

  if (cwd.length === 0) {
    return <StatusLine>No worktree path — nothing to diff.</StatusLine>;
  }

  if (diffPreview.isPending && !diffPreview.data) {
    return (
      <p className="flex items-center gap-2 px-3 py-2 font-mono text-[11px] text-muted-foreground/75">
        <Spinner className="size-3" />
        Loading worktree diff…
      </p>
    );
  }

  if (diffPreview.error) {
    return (
      <StatusLine>
        <span className="text-destructive">Diff failed:</span> {diffPreview.error}
      </StatusLine>
    );
  }

  if (renderableSources.length === 0) {
    return <StatusLine>No changes in this worktree.</StatusLine>;
  }

  return (
    <div className="divide-y divide-border/50">
      {renderableSources.map(({ source, renderablePatch, codeViewFiles, sectionIdentity }) => {
        const sectionTitle = source.kind === "working-tree" ? "Working tree" : "Branch changes";
        return renderablePatch.kind === "raw" ? (
          <div key={source.id} className="space-y-2 px-3 py-2">
            <p className="font-mono text-[11px] font-medium text-foreground">{sectionTitle}</p>
            <p className="font-mono text-[11px] text-muted-foreground/75">
              {renderablePatch.reason}
            </p>
            <pre className="overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
              {renderablePatch.text}
            </pre>
          </div>
        ) : (
          <AnnotatableCodeView
            key={source.id}
            className="diff-render-surface max-h-[420px] overflow-auto"
            files={codeViewFiles}
            sectionId={sectionIdentity.sectionId}
            restoreSectionIds={sectionIdentity.restoreSectionIds}
            sectionTitle={sectionTitle}
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
      })}
    </div>
  );
}
