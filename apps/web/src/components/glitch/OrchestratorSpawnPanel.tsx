// GLITCHY (gl11tchy): fork-owned orchestration layer — spawn N worktree agents on a project
import { scopedProjectKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type ScopedProjectRef, ThreadId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { MinusIcon, PlusIcon, ZapIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { buildThreadRouteParams } from "../../threadRoutes";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";
import {
  describeSpawnOutcome,
  MAX_SPAWN_COUNT,
  MIN_SPAWN_COUNT,
  stepSpawnCount,
} from "./orchestrator.logic";
import { useSpawnWorktreeAgents, type SpawnWorktreeAgentsResult } from "./useSpawnWorktreeAgents";

interface OrchestratorSpawnPanelProps {
  projects: ReadonlyArray<EnvironmentProject>;
  selectedProjectRef: ScopedProjectRef | null;
  onSelectProject: (ref: ScopedProjectRef) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
}

const toneClass: Record<ReturnType<typeof describeSpawnOutcome>["tone"], string> = {
  success: "text-primary",
  partial: "text-amber-500 dark:text-amber-400",
  error: "text-destructive",
};

export function OrchestratorSpawnPanel({
  projects,
  selectedProjectRef,
  onSelectProject,
  prompt,
  onPromptChange,
}: OrchestratorSpawnPanelProps) {
  const [count, setCount] = useState(3);
  // Keep the projectRef used for the spawn alongside the result — outcome links
  // must keep pointing at the spawn-time project even if the selector changes.
  const [result, setResult] = useState<{
    outcome: SpawnWorktreeAgentsResult;
    projectRef: ScopedProjectRef;
  } | null>(null);
  const { spawnAgents, isSpawning } = useSpawnWorktreeAgents();

  const projectByKey = useMemo(() => {
    const map = new Map<string, EnvironmentProject>();
    for (const project of projects) {
      map.set(
        scopedProjectKey({ environmentId: project.environmentId, projectId: project.id }),
        project,
      );
    }
    return map;
  }, [projects]);

  const selectedKey = selectedProjectRef ? scopedProjectKey(selectedProjectRef) : "";

  const handleSpawn = useCallback(async () => {
    if (!selectedProjectRef) {
      return;
    }
    const spawnResult = await spawnAgents({ projectRef: selectedProjectRef, prompt, count });
    setResult({ outcome: spawnResult, projectRef: selectedProjectRef });
  }, [count, prompt, selectedProjectRef, spawnAgents]);

  const promptEmpty = prompt.trim().length === 0;
  const canSpawn = selectedProjectRef !== null && !promptEmpty && !isSpawning;
  const summary = result ? describeSpawnOutcome(result.outcome) : null;

  return (
    <div className="glitch-terminal-frame flex flex-col gap-3 rounded-lg bg-card/50 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-52 flex-1 flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Project
          </span>
          <Select
            value={selectedKey}
            onValueChange={(key) => {
              const project = key ? projectByKey.get(key) : undefined;
              if (project) {
                onSelectProject({ environmentId: project.environmentId, projectId: project.id });
              }
            }}
          >
            <SelectTrigger size="sm" className="w-full font-mono text-xs">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => {
                const key = scopedProjectKey({
                  environmentId: project.environmentId,
                  projectId: project.id,
                });
                return (
                  <SelectItem key={key} value={key} className="font-mono text-xs">
                    {project.title}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </label>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Agents
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Fewer agents"
              disabled={count <= MIN_SPAWN_COUNT || isSpawning}
              onClick={() => setCount((value) => stepSpawnCount(value, -1))}
            >
              <MinusIcon className="size-3.5" />
            </Button>
            <span className="w-8 text-center font-mono text-sm tabular-nums text-foreground">
              {count}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="More agents"
              disabled={count >= MAX_SPAWN_COUNT || isSpawning}
              onClick={() => setCount((value) => stepSpawnCount(value, 1))}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        <Button
          variant="default"
          size="sm"
          className="h-8 gap-1.5"
          disabled={!canSpawn}
          onClick={handleSpawn}
        >
          {isSpawning ? <Spinner className="size-4" /> : <ZapIcon className="size-4" />}
          {isSpawning ? "Spawning…" : `Spawn ${count}`}
        </Button>
      </div>

      <Textarea
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder="Prompt for every spawned agent…"
        className="min-h-20 resize-y font-mono text-xs"
        disabled={isSpawning}
      />

      {summary && result ? (
        <div className="flex flex-col gap-1.5">
          <p className={`font-mono text-xs ${toneClass[summary.tone]}`}>{summary.headline}</p>
          <ul className="flex flex-col gap-1">
            {result.outcome.outcomes.map((outcome) =>
              outcome.ok && outcome.threadId ? (
                <li key={outcome.index} className="font-mono text-[11px] text-muted-foreground/80">
                  <span className="text-primary">agent {outcome.index + 1}</span>{" "}
                  <Link
                    to="/$environmentId/$threadId"
                    params={buildThreadRouteParams(
                      scopeThreadRef(
                        result.projectRef.environmentId,
                        ThreadId.make(outcome.threadId),
                      ),
                    )}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    open thread
                  </Link>
                </li>
              ) : (
                <li key={outcome.index} className="font-mono text-[11px] text-destructive">
                  agent {outcome.index + 1}: {outcome.error ?? "failed"}
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
