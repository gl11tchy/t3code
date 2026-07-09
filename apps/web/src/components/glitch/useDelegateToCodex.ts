// GLITCHY (gl11tchy): fork-owned orchestration layer — open a Codex-prefilled draft (no send)
import {
  scopedProjectKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  DEFAULT_RUNTIME_MODE,
  DEFAULT_SERVER_SETTINGS,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { orderItemsByPreferredIds } from "../Sidebar.logic";
import {
  type DraftThreadEnvMode,
  markPromotedDraftThreadByRef,
  useComposerDraftStore,
} from "../../composerDraftStore";
import { newDraftId, newThreadId } from "../../lib/utils";
import { resolveNewDraftStartFromOrigin } from "../../lib/chatThreadActions";
import {
  deriveLogicalProjectKeyFromSettings,
  getProjectOrderKey,
  selectProjectGroupingSettings,
} from "../../logicalProject";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { readThreadShell, useProjects, useServerConfigs } from "../../state/entities";
import { primaryServerProvidersAtom } from "../../state/server";
import { legacyProjectCwdPreferenceKey, useUiStateStore } from "../../uiStateStore";
import { useClientSettings } from "../../hooks/useSettings";
import {
  buildCodexModelSelection,
  isCodexAvailableFromEntries,
  normalizeDelegateToCodexInput,
  resolveCodexInstance,
} from "./delegateToCodex.logic";

export interface DelegateToCodexInput {
  /** Text to prefill in the new draft (may be empty string). */
  prompt: string;
  /** Default: the same default project `useHandleNewThread` exposes. */
  projectRef?: ScopedProjectRef;
  /** Default `"local"`. */
  envMode?: "local" | "worktree";
}

export function useDelegateToCodex(
  /**
   * When given, `isCodexAvailable` is computed from THIS project's environment —
   * the same environment `delegateToCodex` will resolve providers from — instead
   * of the primary server's.
   */
  targetProjectRef?: ScopedProjectRef | null,
): {
  delegateToCodex: (input: DelegateToCodexInput) => Promise<{ ok: boolean; error?: string }>;
  isCodexAvailable: boolean;
} {
  const providers = useAtomValue(primaryServerProvidersAtom);
  const projects = useProjects();
  const serverConfigs = useServerConfigs();
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const router = useRouter();

  const providerEntries = useMemo(() => deriveProviderInstanceEntries(providers), [providers]);

  const isCodexAvailable = useMemo(() => {
    const targetProviders = targetProjectRef
      ? serverConfigs.get(targetProjectRef.environmentId)?.providers
      : undefined;
    return isCodexAvailableFromEntries(
      targetProviders ? deriveProviderInstanceEntries(targetProviders) : providerEntries,
    );
  }, [providerEntries, serverConfigs, targetProjectRef]);

  const defaultProjectRef = useMemo((): ScopedProjectRef | null => {
    const orderedProjects = orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: getProjectOrderKey,
      getPreferenceIds: (project) => [
        getProjectOrderKey(project),
        legacyProjectCwdPreferenceKey(project.workspaceRoot),
      ],
    });
    const first = orderedProjects[0];
    return first ? scopeProjectRef(first.environmentId, first.id) : null;
  }, [projectOrder, projects]);

  const delegateToCodex = useCallback(
    async (input: DelegateToCodexInput): Promise<{ ok: boolean; error?: string }> => {
      try {
        const projectRef = input.projectRef ?? defaultProjectRef;
        if (!projectRef) {
          return {
            ok: false,
            error: "No project available to open a draft against.",
          };
        }

        // Resolve Codex from the TARGET environment's providers (multi-environment
        // correctness); fall back to the primary server's entries when the target
        // environment has no config loaded yet.
        const targetProviders = serverConfigs.get(projectRef.environmentId)?.providers;
        const codexEntry = resolveCodexInstance(
          targetProviders ? deriveProviderInstanceEntries(targetProviders) : providerEntries,
        );
        if (!codexEntry) {
          return {
            ok: false,
            error: "No enabled and available Codex provider instance found.",
          };
        }

        const { prompt, envMode } = normalizeDelegateToCodexInput(input);
        const initialEnvMode: DraftThreadEnvMode = envMode;

        const project = projects.find(
          (candidate) =>
            candidate.id === projectRef.projectId &&
            candidate.environmentId === projectRef.environmentId,
        );
        const environmentSettings =
          serverConfigs.get(projectRef.environmentId)?.settings ?? DEFAULT_SERVER_SETTINGS;
        const logicalProjectKey = project
          ? deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings)
          : scopedProjectKey(projectRef);

        const codexSelection = buildCodexModelSelection(codexEntry);
        const {
          getDraftSessionByLogicalProjectKey,
          setDraftThreadContext,
          setLogicalProjectDraftThreadId,
          setModelSelection,
          setPrompt,
        } = useComposerDraftStore.getState();

        // Reuse the project's existing unsent draft like useHandleNewThread does —
        // remapping to a fresh draftId would delete its content. A stored draft
        // whose thread already exists server-side was promoted; mark it and start fresh.
        const storedDraftThread = getDraftSessionByLogicalProjectKey(logicalProjectKey);
        const storedDraftThreadRef = storedDraftThread
          ? scopeThreadRef(storedDraftThread.environmentId, storedDraftThread.threadId)
          : null;
        const reusableStoredDraftThread =
          storedDraftThreadRef && readThreadShell(storedDraftThreadRef) !== null
            ? null
            : storedDraftThread;
        if (storedDraftThreadRef && reusableStoredDraftThread === null) {
          markPromotedDraftThreadByRef(storedDraftThreadRef);
        }

        if (reusableStoredDraftThread) {
          // Always apply the normalized envMode (defaults to "local") so a
          // pre-existing worktree draft is not reused with the wrong mode.
          setDraftThreadContext(reusableStoredDraftThread.draftId, {
            envMode: initialEnvMode,
          });
          setLogicalProjectDraftThreadId(
            logicalProjectKey,
            projectRef,
            reusableStoredDraftThread.draftId,
            { threadId: reusableStoredDraftThread.threadId },
          );
          setModelSelection(reusableStoredDraftThread.draftId, codexSelection);
          // Only overwrite the draft's prompt with a real handoff prompt — an
          // empty delegate action must not erase what the user already typed.
          if (prompt.trim().length > 0) {
            setPrompt(reusableStoredDraftThread.draftId, prompt);
          }
          await router.navigate({
            to: "/draft/$draftId",
            params: { draftId: reusableStoredDraftThread.draftId },
          });
          return { ok: true };
        }

        const draftId = newDraftId();
        const threadId = newThreadId();
        const createdAt = new Date().toISOString();

        // Match useHandleNewThread new-draft branch (store mapping + envMode),
        // but do NOT applyStickyState — that would point the draft at the user's
        // sticky provider. Target Codex only via draft-scoped setModelSelection
        // (which also sets draft activeProvider) so sticky global state is untouched.
        setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, draftId, {
          threadId,
          createdAt,
          branch: null,
          worktreePath: null,
          envMode: initialEnvMode,
          startFromOrigin: resolveNewDraftStartFromOrigin({
            envMode: initialEnvMode,
            newWorktreesStartFromOrigin: environmentSettings.newWorktreesStartFromOrigin,
          }),
          runtimeMode: DEFAULT_RUNTIME_MODE,
        });

        setModelSelection(draftId, codexSelection);
        setPrompt(draftId, prompt);

        await router.navigate({
          to: "/draft/$draftId",
          params: { draftId },
        });

        return { ok: true };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Failed to open Codex draft.";
        return { ok: false, error: message };
      }
    },
    [defaultProjectRef, projectGroupingSettings, projects, providerEntries, router, serverConfigs],
  );

  return { delegateToCodex, isCodexAvailable };
}
