// GLITCHY (gl11tchy): fork-owned orchestration layer — sequential worktree-backed multi-agent spawn
import {
  DEFAULT_SERVER_SETTINGS,
  type ModelSelection,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";
import { createModelSelection } from "@t3tools/shared/model";
import { truncate } from "@t3tools/shared/String";
import { useCallback, useRef, useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { newMessageId, newThreadId, randomHex } from "../../lib/utils";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
} from "../../providerInstances";
import { readProject, useServerConfigs } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { vcsEnvironment } from "../../state/vcs";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "../../types";
import {
  buildSpawnPlan,
  formatUnknownError,
  makeUniformFailedOutcomes,
  resolveSpawnModelSelection,
  summarizeOutcomes,
  type SpawnAgentOutcome,
  type SpawnWorktreeAgentsResult,
} from "./spawnWorktreeAgents.logic";

export interface SpawnWorktreeAgentsInput {
  projectRef: ScopedProjectRef;
  prompt: string;
  /** Clamped to 1..8 in the logic layer. */
  count: number;
  /**
   * When omitted: sticky selection for the active provider, else project
   * default, else first usable provider in the target environment, else
   * codex/DEFAULT_MODEL. Sticky/project defaults are validated against the
   * selected environment's provider entries before use.
   */
  modelSelection?: ModelSelection;
  /**
   * Base branch for the worktrees. When omitted, resolve the project's current
   * branch via VCS status (same source BranchToolbar uses). If unresolvable,
   * each spawn fails with a clear error — spawnAgents never rejects.
   */
  baseBranch?: string;
}

export type { SpawnAgentOutcome, SpawnWorktreeAgentsResult };

export function useSpawnWorktreeAgents(): {
  spawnAgents: (input: SpawnWorktreeAgentsInput) => Promise<SpawnWorktreeAgentsResult>;
  isSpawning: boolean;
} {
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, {
    reportFailure: false,
  });
  const refreshVcsStatus = useAtomCommand(vcsEnvironment.refreshStatus, {
    reportFailure: false,
  });
  const serverConfigs = useServerConfigs();

  const [isSpawning, setIsSpawning] = useState(false);
  // Guard concurrent calls without relying solely on React state timing.
  const spawningRef = useRef(false);

  const spawnAgents = useCallback(
    async (input: SpawnWorktreeAgentsInput): Promise<SpawnWorktreeAgentsResult> => {
      const plan = buildSpawnPlan(input);

      const failAll = (error: string): SpawnWorktreeAgentsResult =>
        summarizeOutcomes(makeUniformFailedOutcomes(plan.count, error));

      if (plan.promptError) {
        return failAll(plan.promptError);
      }

      if (spawningRef.current) {
        return failAll("A spawn batch is already in progress.");
      }

      spawningRef.current = true;
      setIsSpawning(true);

      try {
        const project = readProject(input.projectRef);
        if (!project) {
          return failAll("Project not found for the given projectRef.");
        }

        // Match the model picker: overlay settings onto streamed provider
        // snapshots so a just-disabled/deleted instance is not still selected
        // from a stale enabled probe, then only accept ready instances.
        const serverConfig = serverConfigs.get(input.projectRef.environmentId);
        const environmentSettings = serverConfig?.settings ?? DEFAULT_SERVER_SETTINGS;
        const environmentEntries = applyProviderInstanceSettings(
          deriveProviderInstanceEntries(serverConfig?.providers ?? []),
          environmentSettings,
        );
        const modelSelection = resolveModelSelection(
          input.modelSelection,
          project.defaultModelSelection,
          environmentEntries,
        );
        const titleSeed = truncate(plan.prompt);

        let baseBranch = input.baseBranch?.trim() || null;
        if (!baseBranch) {
          const resolved = await resolveProjectCurrentBranch({
            environmentId: input.projectRef.environmentId,
            cwd: project.workspaceRoot,
            refreshVcsStatus,
          });
          if (!resolved.ok) {
            return failAll(resolved.error);
          }
          baseBranch = resolved.branch;
        }

        const startFromOrigin = environmentSettings.newWorktreesStartFromOrigin === true;

        const outcomes: SpawnAgentOutcome[] = [];

        // Sequential: parallel worktree creation races git locks on the same repo.
        for (const agent of plan.agents) {
          try {
            const threadId = newThreadId();
            const messageId = newMessageId();
            const createdAt = new Date().toISOString();
            const threadCreateModelSelection = createModelSelection(
              modelSelection.instanceId,
              modelSelection.model,
              modelSelection.options,
            );

            const startResult = await startThreadTurn({
              environmentId: input.projectRef.environmentId,
              input: {
                threadId,
                message: {
                  messageId,
                  role: "user",
                  text: plan.prompt,
                  attachments: [],
                },
                modelSelection,
                titleSeed,
                runtimeMode: DEFAULT_RUNTIME_MODE,
                interactionMode: DEFAULT_INTERACTION_MODE,
                bootstrap: {
                  createThread: {
                    projectId: project.id,
                    title: titleSeed,
                    modelSelection: threadCreateModelSelection,
                    runtimeMode: DEFAULT_RUNTIME_MODE,
                    interactionMode: DEFAULT_INTERACTION_MODE,
                    branch: baseBranch,
                    worktreePath: null,
                    createdAt,
                  },
                  prepareWorktree: {
                    projectCwd: project.workspaceRoot,
                    baseBranch,
                    branch: buildTemporaryWorktreeBranchName(randomHex),
                    ...(startFromOrigin ? { startFromOrigin: true } : {}),
                  },
                  runSetupScript: true,
                },
                createdAt,
              },
            });

            if (startResult._tag === "Failure") {
              outcomes.push({
                index: agent.index,
                ok: false,
                error: formatCommandFailure(startResult, "Failed to start thread turn."),
              });
              continue;
            }

            outcomes.push({
              index: agent.index,
              ok: true,
              threadId,
            });
          } catch (error) {
            outcomes.push({
              index: agent.index,
              ok: false,
              error: formatUnknownError(error, "Failed to spawn worktree agent."),
            });
          }
        }

        // Ensure length always equals clamped count even if the loop was partial.
        while (outcomes.length < plan.count) {
          outcomes.push({
            index: outcomes.length,
            ok: false,
            error: "Spawn did not complete for this agent.",
          });
        }

        return summarizeOutcomes(outcomes);
      } catch (error) {
        // Outer catch: spawnAgents must never reject.
        return failAll(formatUnknownError(error, "Failed to spawn worktree agents."));
      } finally {
        spawningRef.current = false;
        setIsSpawning(false);
      }
    },
    [refreshVcsStatus, serverConfigs, startThreadTurn],
  );

  return { spawnAgents, isSpawning };
}

function resolveModelSelection(
  explicit: ModelSelection | undefined,
  projectDefault: ModelSelection | null | undefined,
  entries: ReturnType<typeof deriveProviderInstanceEntries>,
): ModelSelection {
  const store = useComposerDraftStore.getState();
  const stickyActive = store.stickyActiveProvider;
  const sticky =
    stickyActive !== null ? (store.stickyModelSelectionByProvider[stickyActive] ?? null) : null;

  return resolveSpawnModelSelection({
    explicit,
    sticky,
    projectDefault,
    entries,
  });
}

async function resolveProjectCurrentBranch(input: {
  environmentId: ScopedProjectRef["environmentId"];
  cwd: string;
  refreshVcsStatus: (value: {
    environmentId: ScopedProjectRef["environmentId"];
    input: { cwd: string };
  }) => Promise<AtomCommandResult<{ refName: string | null }, unknown>>;
}): Promise<{ ok: true; branch: string } | { ok: false; error: string }> {
  try {
    const statusResult = await input.refreshVcsStatus({
      environmentId: input.environmentId,
      input: { cwd: input.cwd },
    });

    if (statusResult._tag === "Failure") {
      return {
        ok: false,
        error: `Could not resolve the project's current branch: ${formatCommandFailure(
          statusResult,
          "VCS status request failed.",
        )}`,
      };
    }

    const refName = statusResult.value.refName?.trim() ?? "";
    if (refName.length === 0) {
      return {
        ok: false,
        error:
          "Could not resolve the project's current branch (repository has no checked-out ref). Pass baseBranch explicitly.",
      };
    }

    return { ok: true, branch: refName };
  } catch (error) {
    return {
      ok: false,
      error: `Could not resolve the project's current branch: ${formatUnknownError(
        error,
        "VCS status request failed.",
      )}`,
    };
  }
}

function formatCommandFailure(
  result: { readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"] },
  fallback: string,
): string {
  const squashed = squashAtomCommandFailure(result);
  return formatUnknownError(squashed, fallback);
}
