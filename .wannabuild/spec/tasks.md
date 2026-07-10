# Tasks — Glitchy Code fork (backfilled from approved plan; order 0 → 1 → 2 → 4 → 3)

## Task WBRT-001: Phase 0 — Fork hygiene: add upstream remote

- phase: implement
- dependencies: none
- expected_files: (git config only)
- acceptance_criteria: `git remote -v` shows `upstream` → pingdotgg/t3code; `git fetch upstream` succeeds
- verification_commands: `git remote -v && git fetch upstream --dry-run`
- risk_level: low

## Task WBRT-002: Phase 1 — Rebrand name to "Glitchy Code"

- phase: implement
- dependencies: WBRT-001
- expected_files: apps/desktop/src/app/DesktopEnvironment.ts, apps/web/src/branding.ts, apps/desktop/package.json, scripts/build-desktop-artifact.ts
- acceptance_criteria: APP_BASE_NAME, web fallback, productName all read "Glitchy Code"; DESKTOP_APP_ID/schemes untouched
- verification_commands: `pnpm typecheck && pnpm test`
- risk_level: low

## Task WBRT-003: Phase 1 — Dark-first glitch theme + mono-forward type

- phase: implement
- dependencies: WBRT-002
- expected_files: apps/web/src/index.css, apps/web/src/glitch-theme.css, apps/web/src/main.tsx
- acceptance_criteria: token values only in index.css; flourishes in new glitch-theme.css; theme default dark with light kept; JetBrains Mono forward; no `shadcn add`
- verification_commands: `pnpm typecheck && pnpm test`
- risk_level: medium

## Task WBRT-004: Phase 2 — Fable default + hide Haiku + sticky persistence tests

- phase: implement
- dependencies: WBRT-001
- expected_files: packages/contracts/src/model.ts, apps/web/src/glitchModelPolicy.ts, apps/web/src/modelSelection.ts, tests
- acceptance_criteria: Claude default `claude-fable-5`; Haiku hidden not removed; one-line union edit marked GLITCHY; tests extended; no test asserts Haiku default
- verification_commands: `pnpm typecheck && pnpm test`
- risk_level: medium

## Task WBRT-005: Phase 4 — Config unification verification + updater neutralization note

- phase: implement
- dependencies: WBRT-001
- expected_files: docs/fork build note (new file)
- acceptance_criteria: shadow-home passthrough verified; CodexHomeLayout resolves ~/.codex; updater reports "no update feed is configured" without env; build note documents env
- verification_commands: `pnpm typecheck && pnpm test`
- risk_level: low

## Task WBRT-006: Phase 3 — spawnWorktreeAgents + Codex delegation + orchestrator dashboard

- phase: implement
- dependencies: WBRT-004, WBRT-005
- expected_files: apps/web/src/components/glitch/spawnWorktreeAgents.ts, apps/web/src/components/glitch/\*, apps/web/src/routes/glitch.orchestrator.tsx, CommandPalette.tsx (1–2 lines)
- acceptance_criteria: N-agent spawn with per-thread failure tolerance; Codex delegation action; dashboard lists sibling worktree threads with diffs + merge; no ClaudeAdapter.ts/build-desktop-artifact.ts touches
- verification_commands: `pnpm typecheck && pnpm test`
- risk_level: high
