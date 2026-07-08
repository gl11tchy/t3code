# Feasibility (backfilled from approved plan — verified by codebase exploration in planning session)

- Branding is centralized: `apps/desktop/src/app/DesktopEnvironment.ts` (`APP_BASE_NAME`), `apps/web/src/branding.ts` + `branding.logic.ts`, `scripts/build-desktop-artifact.ts`, icon table `scripts/lib/brand-assets.ts`.
- Theme is one file: `apps/web/src/index.css` (Tailwind v4 CSS-first tokens, `.dark` variant). Font import in `apps/web/src/main.tsx`; JetBrains Mono already a dependency.
- `~/.claude` config already loads: `ClaudeAdapter.ts` `CLAUDE_SETTING_SOURCES = ["user","project","local"]`. Codex home via `CodexHomeLayout.ts`.
- Model catalog: `packages/shared/src` `BUILT_IN_MODELS`; default at `packages/contracts/src/model.ts:152`; Fable slug + effort-high default at `ClaudeProvider.ts:57`.
- Worktrees: full lifecycle in `apps/server/src/git/GitManager.ts`; all orchestration primitives exist as RPCs (`vcs.createWorktree`, `orchestration.getFullThreadDiff`, `git.preparePullRequestThread`, `review.getDiffPreview`).
- Updater: reads repo from env; absent env → "no update feed is configured". Zero code to neutralize.
- Verdict: feasible; MVP is a client-side layer plus token edits. No new server/contract surface required.
