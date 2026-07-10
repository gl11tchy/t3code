# Design — Glitchy Code fork (backfilled from approved plan `can-we-reskin-this-curried-pine.md`)

Work in `/Users/exec/.t3/worktrees/t3code/t3code-b65560fa`, branch `t3code/global-workflow-reskin`.
Shipping order: **0 → 1 → 2 → 4 → 3** (each independently shippable).

## Fork discipline (architecture backbone)

- All fork-owned code in **new files** (`apps/web/src/components/glitch/`, `glitch-theme.css`, `glitchModelPolicy.ts`).
- Existing-file edits kept to single lines/blocks marked `// GLITCHY:`; maintain a rebase conflict map of every such line.
- Never touch `apps/server/src/provider/Layers/ClaudeAdapter.ts`. Touch `scripts/build-desktop-artifact.ts` only for productName resolution.
- Attribution: `gl11tchy` only.

## Phase 0 — Fork hygiene

Add `upstream` remote → `https://github.com/pingdotgg/t3code.git` (verify slug). Enables periodic `git merge upstream/main`.

## Phase 1 — Reskin

- Name: `DesktopEnvironment.ts` `APP_BASE_NAME` → "Glitchy Code" (~line 79); `apps/web/src/branding.ts:19` fallback; `apps/desktop/package.json` `productName`; `build-desktop-artifact.ts` productName resolution only. Keep `DESKTOP_APP_ID`, dirs, protocol schemes.
- Theme: `apps/web/src/index.css` token **values only** (`--background`, `--foreground`, `--color-primary`, `--radius`, fonts) for dark-first glitch palette; additive flourishes in new `apps/web/src/glitch-theme.css` imported from `main.tsx`; theme-provider default → dark (light kept).
- Type: point `--font-sans`/`--font-mono` at JetBrains Mono (already imported at `main.tsx:8-10`).
- Icons: swap binaries in place when artwork exists (`apps/desktop/resources/*`, `assets/{dev,nightly,prod}/*`, dev dock icon at `DesktopEnvironment.ts` ~line 243); follow-up, not a blocker.
- Risk: private shadcn registries `@coss`/`@spell` — never `shadcn add`.

## Phase 2 — Model routing defaults

- `packages/contracts/src/model.ts:152` `DEFAULT_MODEL_BY_PROVIDER[CLAUDE_DRIVER_KIND]` → `"claude-fable-5"` (effort high already default at `ClaudeProvider.ts:57`; resolver degrades gracefully — don't hard-pin).
- Persistence: existing `stickyModelSelectionByProvider` (`composerDraftStore.ts`) + `useNewThreadHandler` — zero new code.
- Hide Haiku: new `apps/web/src/glitchModelPolicy.ts` exporting `HIDDEN_MODEL_SLUGS = ["claude-haiku-4-5"]`, unioned into `hiddenModels` with one added line in `applyInstanceModelPreferences` (`apps/web/src/modelSelection.ts`).
- Extend `modelSelection`/`composerDraftStore` tests; ensure no test asserts Haiku as Claude default.

## Phase 4 — Config unification + updater neutralization (mostly verification)

- Verify `~/.claude` sources load in a GUI session (skill, subagent, user MCP server) — `CLAUDE_SETTING_SOURCES` already `["user","project","local"]`.
- Watch: `homePath`/`shadowHomePath` (`packages/contracts/src/settings.ts`) must pass through to real homes, not a shadow home.
- Confirm `CodexHomeLayout` resolves `~/.codex`.
- Updater: build without `T3CODE_DESKTOP_UPDATE_REPOSITORY`/`GITHUB_REPOSITORY`, set `T3CODE_DISABLE_AUTO_UPDATE=1`; document in fork build note. Zero code.

## Phase 3 — Orchestrator + parallel worktrees + Codex delegation (flagship)

All primitives exist as RPCs; MVP = client-side orchestration layer, no new server/contract surface.

- 3a. `apps/web/src/components/glitch/spawnWorktreeAgents.ts` — N drafts via `useHandleNewThread` + `setDraftThreadContext` (`envMode: "worktree"`), bounded concurrency, tolerate per-thread failure, surface per-agent errors. Entry: one `CommandPalette.tsx` item.
- 3b. Delegate-to-Codex: palette action + composer button — new draft with Codex provider, prompt prefilled, optional worktree. Thin wrapper over `setStickyModelSelection` + `useHandleNewThread`. Lives in `glitch/`.
- 3c. Orchestrator dashboard: new route `apps/web/src/routes/glitch.orchestrator.tsx` (file-based TanStack Router) — sibling worktree threads, status, diffs via `DiffPanel.tsx`'s RPCs, merge via git RPCs. One nav entry.
- Defer: server-side fan-out orchestrator.

## Verification (per phase)

`pnpm typecheck` + `pnpm test`; Phase 1 adds `pnpm dev:web`/`dev:desktop` + `pnpm test:desktop-smoke`; Phase 2 manual picker check; Phase 3 scratch-repo 2-agent spawn; Phase 4 updater log + GUI-vs-terminal config parity.
