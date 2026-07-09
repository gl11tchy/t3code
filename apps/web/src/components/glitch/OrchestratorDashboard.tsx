// GLITCHY (gl11tchy): fork-owned orchestration layer — the orchestrator dashboard (daily-driver cockpit)
import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { BoxesIcon, SparklesIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import { useProjects, useThreadShellsForProjectRefs } from "../../state/entities";
import { resolveThreadStatusPill } from "../Sidebar.logic";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { OrchestratorFleetRow } from "./OrchestratorFleetRow";
import { OrchestratorSpawnPanel } from "./OrchestratorSpawnPanel";
import { filterWorktreeThreads, summarizeFleetStatuses } from "./orchestrator.logic";
import { useDelegateToCodex } from "./useDelegateToCodex";

function FleetStatChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-card/40 px-2 py-1 font-mono text-[11px]">
      <span className={`tabular-nums ${tone}`}>{value}</span>
      <span className="text-muted-foreground/60 uppercase tracking-wider">{label}</span>
    </span>
  );
}

export function OrchestratorDashboard() {
  const projects = useProjects();
  const { defaultProjectRef } = useHandleNewThread();

  const [selectedProjectRef, setSelectedProjectRef] = useState<ScopedProjectRef | null>(null);
  const [prompt, setPrompt] = useState("");

  const activeRef = selectedProjectRef ?? defaultProjectRef;
  const { delegateToCodex, isCodexAvailable } = useDelegateToCodex(activeRef);
  const activeKey = activeRef ? scopedProjectKey(activeRef) : null;

  const projectRefs = useMemo(
    () => (activeRef ? [activeRef] : []),
    // Keyed on the stable scoped key so we don't thrash the atom on identity churn.
    [activeKey],
  );

  const activeProject = useMemo(
    () =>
      activeRef
        ? (projects.find(
            (project) =>
              project.id === activeRef.projectId &&
              project.environmentId === activeRef.environmentId,
          ) ?? null)
        : null,
    [activeRef, projects],
  );

  const threadShells = useThreadShellsForProjectRefs(projectRefs);
  const worktreeThreads = useMemo(() => filterWorktreeThreads(threadShells), [threadShells]);

  const fleetCounts = useMemo(
    () =>
      summarizeFleetStatuses(
        worktreeThreads.map((thread) => resolveThreadStatusPill({ thread })?.label ?? null),
      ),
    [worktreeThreads],
  );

  const handleDelegateToCodex = useCallback(() => {
    void delegateToCodex({ prompt, ...(activeRef ? { projectRef: activeRef } : {}) });
  }, [activeRef, delegateToCodex, prompt]);

  const codexButton = (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 font-mono text-xs"
      disabled={!isCodexAvailable}
      onClick={handleDelegateToCodex}
    >
      <SparklesIcon className="size-4" />
      Delegate to Codex
    </Button>
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-y-auto p-4 md:p-6">
        <header className="glitch-scanlines flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <BoxesIcon className="glitch-phosphor size-5" />
            <div className="flex flex-col">
              <h1 className="glitch-rgb font-mono text-sm font-semibold tracking-wide text-foreground">
                Orchestrator
              </h1>
              <p className="font-mono text-[11px] text-muted-foreground/70">
                Spawn, watch, and act on parallel worktree agents.
              </p>
            </div>
          </div>
          {isCodexAvailable ? (
            codexButton
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex" />}>
                {codexButton}
              </TooltipTrigger>
              <TooltipPopup side="bottom">No enabled Codex provider is available.</TooltipPopup>
            </Tooltip>
          )}
        </header>

        {projects.length === 0 ? (
          <Empty className="rounded-lg border border-dashed border-border/60">
            <EmptyHeader>
              <EmptyTitle className="font-mono text-sm">No projects yet</EmptyTitle>
              <EmptyDescription className="font-mono text-xs">
                Add a project first — then you can spawn a fleet of worktree agents against it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <OrchestratorSpawnPanel
              projects={projects}
              selectedProjectRef={activeRef}
              onSelectProject={setSelectedProjectRef}
              prompt={prompt}
              onPromptChange={setPrompt}
            />

            <section className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  Worktree fleet
                  {activeProject ? (
                    <span className="ml-1.5 text-muted-foreground/50">/ {activeProject.title}</span>
                  ) : null}
                </h2>
                {worktreeThreads.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FleetStatChip
                      label="running"
                      value={fleetCounts.working}
                      tone="text-primary"
                    />
                    <FleetStatChip
                      label="needs you"
                      value={fleetCounts.attention}
                      tone="text-amber-500 dark:text-amber-400"
                    />
                    <FleetStatChip
                      label="done"
                      value={fleetCounts.completed}
                      tone="text-muted-foreground"
                    />
                  </div>
                ) : null}
              </div>

              {worktreeThreads.length === 0 ? (
                <Empty className="rounded-lg border border-dashed border-border/60">
                  <EmptyHeader>
                    <EmptyTitle className="font-mono text-sm">No worktree agents yet</EmptyTitle>
                    <EmptyDescription className="font-mono text-xs">
                      Spawn a fleet above to see agents, their diffs, and merge/PR actions here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="flex flex-col gap-2">
                  {worktreeThreads.map((thread) => (
                    <OrchestratorFleetRow
                      key={`${thread.environmentId}:${thread.id}`}
                      thread={thread}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </SidebarInset>
  );
}
