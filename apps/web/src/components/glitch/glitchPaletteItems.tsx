// GLITCHY (gl11tchy): fork-owned orchestration layer — command-palette entries (orchestrator + codex)
import { useNavigate } from "@tanstack/react-router";
import { BoxesIcon, SparklesIcon } from "lucide-react";
import { useMemo } from "react";

import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import { resolveThreadActionProjectRef } from "../../lib/chatThreadActions";
import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "../CommandPalette.logic";
import { ORCHESTRATOR_ROUTE_PATH } from "./orchestrator.logic";
import { useDelegateToCodex } from "./useDelegateToCodex";

/**
 * Fork-owned command-palette actions. Kept as a hook so the single marked
 * registration line in CommandPalette stays a one-liner:
 *   `actionItems.push(...useGlitchPaletteItems());`
 */
export function useGlitchPaletteItems(): CommandPaletteActionItem[] {
  const navigate = useNavigate();
  // Delegate against the project of the active thread/draft (same context rule
  // as the New Thread palette action), falling back to the default project.
  const { activeDraftThread, activeThread, defaultProjectRef, handleNewThread } =
    useHandleNewThread();
  const activeProjectRef = resolveThreadActionProjectRef({
    activeDraftThread,
    activeThread: activeThread ?? undefined,
    defaultProjectRef,
    handleNewThread,
  });
  const { delegateToCodex, isCodexAvailable } = useDelegateToCodex(activeProjectRef);

  return useMemo<CommandPaletteActionItem[]>(
    () => [
      {
        kind: "action",
        value: "glitch:open-orchestrator",
        searchTerms: [
          "orchestrator",
          "glitch",
          "fleet",
          "worktree",
          "agents",
          "spawn",
          "dashboard",
        ],
        title: "Open Orchestrator",
        icon: <BoxesIcon className={ITEM_ICON_CLASS} />,
        run: async () => {
          await navigate({ to: ORCHESTRATOR_ROUTE_PATH });
        },
      },
      {
        kind: "action",
        value: "glitch:delegate-to-codex",
        searchTerms: ["codex", "delegate", "glitch", "gpt", "openai", "draft"],
        title: "Delegate to Codex",
        ...(isCodexAvailable ? {} : { description: "No enabled Codex provider is available." }),
        icon: <SparklesIcon className={ITEM_ICON_CLASS} />,
        disabled: !isCodexAvailable,
        run: async () => {
          await delegateToCodex({
            prompt: "",
            ...(activeProjectRef ? { projectRef: activeProjectRef } : {}),
          });
        },
      },
    ],
    [activeProjectRef, delegateToCodex, isCodexAvailable, navigate],
  );
}
