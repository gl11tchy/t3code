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
  type ServerProvider,
  type ServerSettings,
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
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { readThreadShell, useProjects, useServerConfigs } from "../../state/entities";
import { primaryServerProvidersAtom, primaryServerSettingsAtom } from "../../state/server";
import { legacyProjectCwdPreferenceKey, useUiStateStore } from "../../uiStateStore";
import { useClientSettings } from "../../hooks/useSettings";
import {
  buildCodexModelSelection,
  isCodexAvailableFromEntries,
  normalizeDelegateToCodexInput,
  resolveCodexInstance,
} from "./delegateToCodex.logic";

/** Match the composer: overlay settings so a just-disabled/deleted instance is not selected. */
function resolveEnvironmentProviderEntries(
  providers: ReadonlyArray<ServerProvider> | undefined,
  settings: ServerSettings | undefined,
): ReadonlyArray<ProviderInstanceEntry> | null {
  if (!providers) {
    return null;
  }
  return applyProviderInstanceSettings(
    deriveProviderInstanceEntries(providers),
    settings ?? DEFAULT_SERVER_SETTINGS,
  );
}

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
  const primarySettings = useAtomValue(primaryServerSettingsAtom);
  const projects = useProjects();
  const serverConfigs = useServerConfigs();
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const router = useRouter();

  // Primary entries only when no target project is in scope (e.g. empty shell).
  // Never cross-route a target project's draft through primary providers.
  // Overlay settings so a just-disabled/deleted Codex instance is not treated as ready.
  const primaryProviderEntries = useMemo(
    () =>
      resolveEnvironmentProviderEntries(providers, primarySettings ?? DEFAULT_SERVER_SETTINGS) ??
      [],
    [primarySettings, providers],
  );

  const isCodexAvailable = useMemo(() => {
    if (targetProjectRef) {
      const targetConfig = serverConfigs.get(targetProjectRef.environmentId);
      // Config not loaded yet (reconnect, cached remote) — do not claim available
      // via the primary environment's Codex instance.
      const entries = resolveEnvironmentProviderEntries(
        targetConfig?.providers,
        targetConfig?.settings,
      );
      if (!entries) {
        return false;
      }
      return isCodexAvailableFromEntries(entries);
    }
    return isCodexAvailableFromEntries(primaryProviderEntries);
  }, [primaryProviderEntries, serverConfigs, targetProjectRef]);

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

        // Resolve Codex only from the TARGET environment's providers. Cross-routing
        // a primary Codex instance into another environment writes an instance id
        // that does not exist there (or is a different account). Overlay settings
        // so a just-disabled/deleted instance is not written onto the draft.
        const targetConfig = serverConfigs.get(projectRef.environmentId);
        const targetEntries = resolveEnvironmentProviderEntries(
          targetConfig?.providers,
          targetConfig?.settings,
        );
        if (!targetEntries) {
          return {
            ok: false,
            error:
              "Provider configuration for the target environment is not loaded yet. Try again once the environment reconnects.",
          };
        }
        const codexEntry = resolveCodexInstance(targetEntries);
        if (!codexEntry) {
          return {
            ok: false,
            error: "No ready Codex provider instance found in the target environment.",
          };
        }

        const { prompt, envMode } = normalizeDelegateToCodexInput(input);
        const initialEnvMode: DraftThreadEnvMode = envMode;

        const project = projects.find(
          (candidate) =>
            candidate.id === projectRef.projectId &&
            candidate.environmentId === projectRef.environmentId,
        );
        const environmentSettings = targetConfig?.settings ?? DEFAULT_SERVER_SETTINGS;
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
          // When going local, also clear stale worktreePath/branch — ChatView
          // otherwise boots createThread with the old worktree checkout.
          setDraftThreadContext(reusableStoredDraftThread.draftId, {
            envMode: initialEnvMode,
            ...(initialEnvMode === "local" ? { worktreePath: null, branch: null } : {}),
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
    [defaultProjectRef, projectGroupingSettings, projects, router, serverConfigs],
  );

  return { delegateToCodex, isCodexAvailable };
}
