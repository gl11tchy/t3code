# T3 Code — Client-Side Orchestration Integration Map (Phase 3)

Root: `/Users/exec/.t3/worktrees/t3code/t3code-b65560fa`. All paths relative; identifiers exact (verified by exploration 2026-07-08).

## 1. New-thread / draft creation — `apps/web/src/hooks/useHandleNewThread.ts`

- `useNewThreadHandler()` (`:32`) → returns `(projectRef: ScopedProjectRef, options?: { branch?; worktreePath?; envMode?: DraftThreadEnvMode; startFromOrigin? }) => Promise<void>`. Primary programmatic draft-creation entry.
- `useHandleNewThread()` (`:190`) → `{ activeDraftThread, activeThread, defaultProjectRef, handleNewThread, routeThreadRef }`. `defaultProjectRef = scopeProjectRef(orderedProjects[0].environmentId, orderedProjects[0].id)`.
- New-draft branch (`:159-184`): `draftId = newDraftId()`, `threadId = newThreadId()` (from `../lib/utils`), `initialEnvMode = options?.envMode ?? environmentSettings.defaultThreadEnvMode` (`:162`), then `setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, draftId, { threadId, createdAt, branch, worktreePath, envMode: initialEnvMode, startFromOrigin, runtimeMode: DEFAULT_RUNTIME_MODE })` (`:164`), `applyStickyState(draftId)` (`:178`), `router.navigate({ to: "/draft/$draftId", params: { draftId } })` (`:180`). Store getters via `useComposerDraftStore.getState()` (`:52-59`).
- Worktree env mode per draft: pass `options.envMode: "worktree"`; existing-draft path uses `setDraftThreadContext(draftId, { envMode })` (`:99-104`, `:139-144`). BranchToolbar example: `BranchToolbarBranchSelector.tsx:190` calls `setDraftThreadContext(draftId ?? threadRef, { branch, worktreePath, envMode: nextDraftEnvMode, projectRef })`. Env-mode picker: `BranchToolbar.tsx:168-180` (values `"local"`/`"worktree"`, `envModeLocked` at `:232`). `resolveEffectiveEnvMode` in `BranchToolbar.logic.ts`.

## 2. Sticky model selection & draft model — `apps/web/src/composerDraftStore.ts`

- Store hook `useComposerDraftStore` (zustand, persisted key `"t3code:composer-drafts:v1"`, `:59`).
- `setStickyModelSelection(modelSelection: ModelSelection | null | undefined)` — interface `:403`, impl `:2483`; writes `stickyModelSelectionByProvider[instanceId]`, sets `stickyActiveProvider`.
- `setModelSelection(threadRef: ComposerThreadTarget, modelSelection)` — interface `:406`, impl `:2597`. Sets a draft's per-instance model. `ComposerThreadTarget = ScopedThreadRef | DraftId` (`:318`).
- `setPrompt(threadRef, prompt: string)` — interface `:404`, impl `:2551`.
- `applyStickyState(threadRef)` (`:2504`).
- `ModelSelection` = `{ instanceId: ProviderInstanceId, model: string, options?: ProviderOptionSelection[] }`; build with `createModelSelection(instanceId, model, options)` from `@t3tools/shared/model` (used ChatView `:4094`).
- Codex default instance id: `defaultInstanceIdForDriver(ProviderDriverKind.make("codex"))` → literally `"codex"` (`packages/contracts/src/providerInstance.ts:148`).
- Also exported: `markPromotedDraftThreadByRef`, `finalizePromotedDraftThreadByRef`, `createEmptyThreadDraft` (`:595`), `DraftId` (`:64`), `DraftThreadEnvMode` (`:62`), `DraftThreadState`/`DraftSessionState` (`:301/:286`).

## 3. Programmatic send / promotion

Send path lives in `apps/web/src/components/ChatView.tsx` → `onSend` (`:3878`). For a local draft (`isLocalDraftThread` `:1248`) it builds a `bootstrap.createThread` payload (`:4140-4150`) plus optional `prepareWorktree` (`:4154`, only when `sendEnvMode === "worktree"` and a base branch is selected), then calls `startThreadTurn({ environmentId, input: { threadId, message: { messageId, role: "user", text, attachments }, modelSelection, titleSeed, runtimeMode, interactionMode, bootstrap?, createdAt } })` (`:4166`). `startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false })` (`:1014`).

- Draft→thread promotion IS programmatic: one `startThreadTurn` with `bootstrap.createThread` atomically creates the thread (reusing the draft's pre-allocated `threadId`) and starts the first turn.
- CAVEAT: there is NO standalone `sendDraft(draftId)` helper — a headless layer must replicate the `startThreadTurn` payload from ChatView `:4140-4183`.
- `buildLocalDraftThread(threadId, draftThread, defaultModelSelection)` (`:1229`) synthesizes the in-memory thread. Promotion finalized on navigation: `routes/_chat.$environmentId.$threadId.tsx:57` → `finalizePromotedDraftThreadByRef`; `routes/_chat.draft.$draftId.tsx:36` → `markPromotedDraftThreadByRef`.
- Command input types: `packages/client-runtime/src/operations/commands.ts` (`StartThreadTurnInput = CommandInput<"thread.turn.start">` `:41`, `CreateThreadInput` `:34`), re-exported via `threadCommands.ts:35-49`.

## 4. Command palette — `apps/web/src/components/CommandPalette.tsx` + `.logic.ts`

- `CommandPaletteItem` (`.logic.ts:14`): `{ kind: "action" | "submenu"; value; searchTerms: readonly string[]; title: ReactNode; description?; timestamp?; icon: ReactNode; disabled?; titleLeadingContent?; titleTrailingContent?; shortcutCommand?: KeybindingCommand }`.
- `CommandPaletteActionItem` (`:30`): + `{ kind: "action"; keepOpen?: boolean; run: () => Promise<void> }`. `CommandPaletteSubmenuItem` (`:36`), `CommandPaletteGroup` (`:43`).
- Registration: imperative array in the component — `const actionItems: Array<...> = []` (`CommandPalette.tsx:963`), `actionItems.push({ kind: "action", value: "action:new-thread", ... })` (`:971`, `:993`, `:1004`, `:1034`, `:1048`); `buildRootGroups({ actionItems, recentThreadItems })` (`:1059`; `.logic.ts:337`). Add commands by pushing near `:963-1058`. Example `run` (`:982`) calls `startNewThreadFromContext({ activeDraftThread, activeThread, defaultProjectRef, handleNewThread })`.

## 5. File-based routing — `apps/web/src/routes/`

TanStack Router file-based; config `apps/web/src/router.ts`; generated `routeTree.gen.ts`. Dotted flat routes with `_chat` pathless layout. Sample (`settings.archived.tsx`, full file):

```ts
import { createFileRoute } from "@tanstack/react-router";
import { ArchivedThreadsPanel } from "../components/settings/SettingsPanels";
export const Route = createFileRoute("/settings/archived")({ component: ArchivedThreadsPanel });
```

Navigation: `router.navigate({ to: "/draft/$draftId", params })`. Nav/links: `components/Sidebar.tsx` (`Link` from `@tanstack/react-router` `:66`); settings sub-nav `components/settings/SettingsSidebarNav.tsx`; shell `components/AppSidebarLayout.tsx`.

## 6. Sidebar thread listing + worktree indicator

- `useThreadShellsForProjectRefs(refs: ReadonlyArray<ScopedProjectRef>)` — `apps/web/src/state/entities.ts:116` (atom `environmentThreadShells.threadShellsForProjectRefsAtom`); used `Sidebar.tsx:1176`. All threads: `useThreadShells()` (`entities.ts:112`). Row type `SidebarThreadSummary` (`../types`).
- Atoms (`apps/web/src/state/threads.ts`): `environmentThreadShells` (`:23`), `environmentThreads` (`:19`), `environmentThreadDetails` (`:20`).
- `ThreadWorktreeIndicator` — `components/ThreadStatusIndicators.tsx:98`; takes `thread: Pick<SidebarThreadSummary, "id" | "branch" | "worktreePath">`; null if no `worktreePath`, else tooltip via `formatWorktreePathForDisplay` from `../worktreeCleanup` (`:108`). Also: `ThreadRowLeadingStatus` (`:188`), `ThreadStatusLabel` (`:132`), `prStatusIndicator` (`:36`), `resolveThreadPr` (`:74`).

## 7. Diff rendering — `apps/web/src/components/DiffPanel.tsx`

- `DiffPanel({ mode = "inline", composerDraftTarget })` (`:185`) resolves the thread from the ROUTE (`useParams` `:198`) — NOT reusable for an arbitrary thread id. Build wrappers instead:
  - `useCheckpointDiff(target, { enabled })` (`~/lib/checkpointDiffState`, used `:304`) — routes to `orchestrationEnvironment.fullThreadDiff` (when `fromTurnCount === 0`) or `.turnDiff` (`state/queries.ts:217`, `:250-256`).
  - `reviewEnvironment.diffPreview({ environmentId, input: { cwd, baseRef?, ignoreWhitespace } })` (used `:317`, `:334`).
  - `useTurnDiffSummaries(activeThread)` (`../hooks/useTurnDiffSummaries`, `:233`).
  - Reusable renderer: `AnnotatableCodeView` (`./diffs/AnnotatableCodeView`, `:802`) taking `files`, `sectionId`, `composerDraftTarget`, `options`; patch parsing via `getRenderablePatch` (`../lib/diffRendering`).
- Orchestration atoms: `packages/client-runtime/src/state/orchestration.ts` (`turnDiff` `:11`, `fullThreadDiff` `:15`); instantiated `apps/web/src/state/orchestration.ts:5` as `orchestrationEnvironment`.

## 8. Git / merge RPCs from the client

- Pattern: per-domain environment atoms (`apps/web/src/state/git.ts:5` `gitEnvironment`, `state/vcs.ts:8` `vcsEnvironment`) + `useAtomCommand(atomCommand, { reportFailure })` (`state/use-atom-command.ts:10`) → `(value) => Promise<AtomCommandResult<A, E>>`; check `result._tag === "Failure" | "Success"`. Call: `await cmd({ environmentId, input: {...} })`.
- `git.preparePullRequestThread`: atom `gitEnvironment.preparePullRequestThread` (`packages/client-runtime/src/state/git.ts:16`); hook `usePreparePullRequestThreadAction(scope)` (`state/sourceControlActions.ts:307`); call site `PullRequestThreadDialog.tsx:142` → `.run({ reference, mode: "local" | "worktree", threadId? })`; underlying (`sourceControlActions.ts:325`) `preparePullRequestThread({ environmentId, input: { cwd, reference, mode, threadId? } })`.
- `runStackedAction`: hook `useGitStackedAction(scope)` (`sourceControlActions.ts:201`) backed by `vcsActionManager.runStackedAction(scope)` (`packages/client-runtime/src/state/vcsAction.ts:525`); call `runStackedAction({ actionId, action: GitStackedAction, commitMessage?, featureBranch?, filePaths?, onProgress? })` (`:234`); consumed in `GitActionsControl.tsx:155`.
- Worktree removal: atom `vcsEnvironment.removeWorktree` (`packages/client-runtime/src/state/vcs.ts:55`); call site `hooks/useThreadActions.ts:291`: `await removeWorktree({ environmentId, input: { cwd: threadProject.workspaceRoot, path: orphanedWorktreePath, force: true } })`, then `refreshVcsStatus({ environmentId, input: { cwd } })`.

## 9. Provider instance enumeration (finding the Codex instance)

- `primaryServerProvidersAtom` — `apps/web/src/state/server.ts:78` → `ReadonlyArray<ServerProvider>`; read via `useAtomValue` (e.g. `settings/SettingsPanels.tsx:484`). Per-environment: `serverEnvironment.configValueAtom(environmentId)?.providers` (ChatView `:1721`).
- `deriveProviderInstanceEntries(providers)` — `apps/web/src/providerInstances.ts:147`; `ProviderInstanceEntry` (`:34`) `{ instanceId, driverKind, displayName, enabled, installed, status, isDefault, isAvailable, snapshot, models }`.
- Find Codex: `.find(e => e.driverKind === "codex" && e.isDefault)` or `getProviderInstanceEntry(providers, ProviderInstanceId.make("codex"))` (`:238`); `resolveSelectableProviderInstance(providers, instanceId?)` (`:262`); `applyProviderInstanceSettings` (`:183`); `sortProviderInstanceEntries` (`:209`).

## 10. Test patterns

- Colocated pure-logic tests with `vite-plus/test` (`import { describe, expect, it } from "vite-plus/test"`), e.g. `apps/web/src/worktreeCleanup.test.ts` (factory `makeThread(overrides)` `:8`; branded ctors `ThreadId.make`, `ProjectId.make`, `ProviderInstanceId.make("codex")`, `EnvironmentId.make`).
- `.logic.ts` + `.logic.test.ts` split for component logic (`CommandPalette.logic.test.ts`, `BranchToolbar.logic.test.ts`) — extract pure functions, keep components thin.

## Cross-cutting flags

- Promotion: one `startThreadTurn` with `bootstrap.createThread` (+ `prepareWorktree` for worktree mode); replicate ChatView `:4140-4183`; no headless helper exists.
- `DiffPanel` is route-scoped; arbitrary-thread diffs need a new wrapper (useCheckpointDiff / diffPreview + AnnotatableCodeView).
- Worktree env mode is per-draft state, not global.
