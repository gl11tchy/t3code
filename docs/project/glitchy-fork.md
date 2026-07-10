# Glitchy Code — fork notes

Personal fork of T3 Code (`pingdotgg/t3code`), maintained by `gl11tchy`. Surface rebrand +
workflow adaptation; internal identifiers (`~/.t3`, `com.t3tools` bundle id, `t3code://`
schemes, `@t3tools` package scope) intentionally unchanged. MIT license and upstream
copyright notice retained.

## Fork discipline

- All fork-owned code lives in new files (`apps/web/src/glitch-theme.css`,
  `apps/web/src/glitchModelPolicy.ts`, `apps/web/src/components/glitch/`, …).
- Every edit to an existing file is a single line/block marked `GLITCHY` — grep for the
  rebase conflict map: `git grep -n GLITCHY -- ':!docs/project/glitchy-fork.md'`
- Never touch `apps/server/src/provider/Layers/ClaudeAdapter.ts` (high churn).
- Upstream merges: `git fetch upstream && git merge upstream/main` (remote `upstream` →
  `https://github.com/pingdotgg/t3code.git`). Expected conflict surface is only the
  GLITCHY-marked lines.
- Attribution: handle `gl11tchy` only — never a real name or personal email in git
  identity, notices, or URLs.

## Building (updater neutralization)

The desktop updater must NOT be able to replace this fork with stock T3 Code:

- Build desktop artifacts **without** `T3CODE_DESKTOP_UPDATE_REPOSITORY` or
  `GITHUB_REPOSITORY` set (`scripts/build-desktop-artifact.ts` only emits an update feed
  — `app-update.yml` — when one of those is present). With no feed, the app reports
  "Automatic updates are not available because no update feed is configured."
- Belt and suspenders: run/package with `T3CODE_DISABLE_AUTO_UPDATE=1`
  (`getAutoUpdateDisabledReason` honors it even if a feed sneaks into a build).
- Publishing fork self-updates via a separate releases repo is explicitly out of scope.

## CLI config unification (verified)

- Claude: `CLAUDE_SETTING_SOURCES = ["user","project","local"]` in the adapter, and
  `ClaudeHome.ts` leaves `$HOME` untouched when the `homePath` setting is empty — the GUI
  uses the real `~/.claude` (CLAUDE.md, skills, subagents, user MCP servers) identical to
  the terminal. Leave the Claude `homePath` provider setting empty.
- Codex: `CodexHomeLayout.ts` resolves to the real `~/.codex` in `direct` mode when
  `homePath`/`shadowHomePath` settings are empty. Leave both empty — setting
  `shadowHomePath` switches to an auth-overlay home and would split config.

## Model routing defaults (fork policy)

- New Claude sessions default to `claude-fable-5`; effort `high` is the model's built-in
  default. Version-gated: an old local Claude CLI silently degrades to the first
  available model (by design, no pinning).
- `claude-haiku-4-5` is hidden from the model picker (`glitchModelPolicy.ts`) but stays
  in the catalog as fallback-of-last-resort; git text generation routes to
  `claude-sonnet-5` instead of Haiku.
- Per-provider last model selection persists across drafts via the existing
  `stickyModelSelectionByProvider` store — no fork code needed.
