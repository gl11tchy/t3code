# Glitchy Code — personal fork of T3 Code (reskin + workflow adaptation)

Backfilled from the approved plan `~/.claude/plans/can-we-reskin-this-curried-pine.md`.
Discovery (WannaBuild Grill) was completed interactively in the planning session; all
dimensions below are user-confirmed. This file records that outcome.

## Vision

Personal fork — **Glitchy Code** — of T3 Code (pingdotgg/t3code): (a) reskin the product
(dark-first, glitch/CRT-adjacent accents, monospace-forward type), and (b) adapt it to the
user's global orchestration workflow: Fable @ high effort as orchestrator, bulk work
delegated to Codex/gpt-5.5, parallel implementation via git worktrees, `~/.claude` /
`~/.codex` config driving behavior. Fork kept rebase-able against fast-moving upstream.

## Discovery record (all dimensions user-confirmed)

| Dimension        | Confirmed answer                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Vision           | Personal fork: rebrand + adapt to global workflow                                                                                              |
| Audience         | Just the user; personal daily driver                                                                                                           |
| Flows/surfaces   | Desktop + web apps (server implicitly). Workflow pillars: model-routing defaults, orchestrator + parallel worktrees, unified CLI config        |
| Constraints      | Rebase-able fork (thin, isolated diffs). MIT notice kept. Attribution: handle `gl11tchy` only                                                  |
| Scope boundaries | Surface rebrand only (internal ids stay). OUT: mobile app, marketing site, skills-in-UI, full identity rename, public releases                 |
| Success signals  | Daily driver: Fable@high defaults; one-click Codex delegation; parallel worktree agents from UI; CLI config just works; upstream merge <30 min |

## Acceptance Criteria

- [ ] Phase 0: `upstream` remote points at pingdotgg/t3code and `git merge upstream/main` is possible.
- [ ] Phase 1: App presents as "Glitchy Code" (Electron chrome, renderer, web fallback, productName); theme is dark-first glitch palette via token-value edits in `apps/web/src/index.css` plus additive `glitch-theme.css`; mono-forward type via JetBrains Mono; `pnpm typecheck` + `pnpm test` pass.
- [ ] Phase 2: New Claude drafts default to `claude-fable-5` at effort high; Haiku is hidden from the model picker (still in catalog as fallback); per-provider last selection persists across drafts; no test asserts Haiku as Claude default.
- [ ] Phase 4: Packaged/dev build reports "no update feed is configured" (updater neutralized without code); `~/.claude` user-level skills/subagents/MCP and `~/.codex` resolve identically to terminal (no shadow-home redirection).
- [ ] Phase 3: From the UI, spawning N worktree agents creates N `~/.t3/worktrees/*` dirs + N threads; per-worktree diffs render; merge works via existing git RPCs; a failed spawn surfaces an error without killing the batch; delegate-to-Codex action creates a Codex-provider draft with prompt prefilled; orchestrator dashboard route lists sibling worktree threads.
- [ ] Fork discipline: fork-owned code in new files (`glitch/`, `glitch-theme.css`, `glitchModelPolicy.ts`); existing-file edits are single lines/blocks marked `// GLITCHY:`; `ClaudeAdapter.ts` untouched; no real name/email anywhere — `gl11tchy` only.
